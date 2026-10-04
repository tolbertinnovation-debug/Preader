import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import fixtures from "../eval/fixtures/images.json";
import { readContentCredentials } from "@/lib/detect/c2pa";
import { buildImageResult } from "@/lib/detect/image";
import { DETECT_IMAGE_MIME, matchAiTool, readImageMeta, sniffDetectImage } from "@/lib/detect/image-meta";
import type { ModelOutcome } from "@/lib/detect/text";
import type { ModelScore } from "@/lib/detect/types";

const DIR = path.resolve(__dirname, "../eval/fixtures");
const notConfigured: ModelOutcome<{ score: ModelScore }> = { status: "not_configured", name: "Sightengine", message: "not set" };
const model = (ai: number): ModelOutcome<{ score: ModelScore }> => ({ status: "ok", name: "Sightengine", output: { score: { provider: "Sightengine", ai, mixed: null, human: null, confidence: null } } });

async function analyse(file: string, m = notConfigured) {
  const buf = fs.readFileSync(path.join(DIR, "images", file));
  const kind = sniffDetectImage(buf);
  if (!kind) throw new Error(`unsupported ${file}`);
  const [meta, c2pa] = await Promise.all([readImageMeta(buf, kind), readContentCredentials(buf, DETECT_IMAGE_MIME[kind])]);
  return buildImageResult({ file: { name: file, type: DETECT_IMAGE_MIME[kind], bytes: buf.length, sha256: "x", width: meta.width, height: meta.height }, meta, c2pa, model: m, id: "T", createdAt: "" });
}

afterEach(() => {
  delete process.env.C2PA_TRUST_ANCHORS;
});

describe("image fixtures (no detection model)", () => {
  for (const f of fixtures.items) {
    it(`${f.file} → ${f.expect}`, async () => {
      const r = await analyse(f.file);
      expect(r.verdict).toBe(f.expect);
      expect(r.score).toBeNull();
    });
  }

  it("accepts a camera capture only when the signer is trusted", async () => {
    process.env.C2PA_TRUST_ANCHORS = fs.readFileSync(path.join(DIR, "certs/test_cert_root_bundle.pem"), "utf8");
    const r = await analyse("c2pa-camera-capture.jpg");
    expect(r.credentials?.state).toBe("trusted");
    expect(r.verdict).toBe("camera_capture");
    const ai = await analyse("c2pa-ai-generated.jpg");
    expect(ai.credentials?.state).toBe("trusted");
    expect(ai.headline).toMatch(/confirmed/);
  });

  it("reports an untrusted signer honestly", async () => {
    const r = await analyse("c2pa-ai-generated.jpg");
    expect(r.credentials?.state).toBe("valid");
    expect(r.credentials?.signer).toBe("C2PA Test Signing Cert");
    expect(r.headline).toMatch(/declared/);
    expect(r.summary).toMatch(/isn't on the C2PA Trust List/);
  });

  it("never treats missing metadata as human", async () => {
    for (const file of ["plain-no-metadata.png", "plain.webp", "camera-exif-gps.jpg"]) {
      const r = await analyse(file);
      expect(r.verdict).toBe("inconclusive");
      expect(r.caveats.join(" ")).toMatch(/never evidence that an image is human-made/);
    }
  });

  it("reads camera details and flags GPS without exposing coordinates", async () => {
    const r = await analyse("camera-exif-gps.jpg");
    expect(r.metadata).toContainEqual(["Camera", "Canon Canon EOS 250D"]);
    expect(r.metadata).toContainEqual(["Location", "GPS coordinates present (not shown)"]);
    expect(JSON.stringify(r)).not.toMatch(/10\.8|6\.3|48\.0/);
    expect(r.evidence.find((e) => e.id === "camera")?.strength).toBe("weak");
  });

  it("does not fetch remote credentials", async () => {
    const r = await analyse("c2pa-remote-manifest.jpg");
    expect(r.checks[0]!.status).toBe("skipped");
    expect(r.checks[0]!.message).toMatch(/cai-manifests\.adobe\.com/);
  });

  it("explains tampering", async () => {
    const r = await analyse("c2pa-ai-then-altered.jpg");
    expect(r.evidence.map((e) => e.id)).toEqual(expect.arrayContaining(["c2pa-changed", "c2pa-ai"]));
    const bad = await analyse("c2pa-bad-signature.jpg");
    expect(bad.credentials?.failures.join(" ")).toMatch(/signature/i);
  });
});

describe("image detection model", () => {
  it("decides from the model only at confident extremes", async () => {
    expect((await analyse("plain.webp", model(0.93))).verdict).toBe("likely_ai");
    expect((await analyse("plain.webp", model(0.05))).verdict).toBe("likely_not_ai");
    const mid = await analyse("plain.webp", model(0.6));
    expect(mid.verdict).toBe("inconclusive");
    expect(mid.score?.ai).toBe(0.6);
  });

  it("lets verified provenance outrank the model and notes the disagreement", async () => {
    const r = await analyse("c2pa-ai-generated.jpg", model(0.02));
    expect(r.verdict).toBe("ai_generated");
    expect(r.evidence.find((e) => e.id === "conflict")).toBeTruthy();
  });

  it("does not report a model score when the model failed", async () => {
    const r = await analyse("plain.webp", { status: "error", name: "Sightengine", message: "timeout" });
    expect(r.score).toBeNull();
    expect(r.verdict).toBe("inconclusive");
  });
});

describe("format and tool detection", () => {
  it("sniffs formats from bytes", () => {
    const ftyp = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from(`ftyp${brand}\0\0\0\0mif1${brand}`)]);
    expect(sniffDetectImage(ftyp("heic"))).toBe("heic");
    expect(sniffDetectImage(ftyp("avif"))).toBe("avif");
    expect(sniffDetectImage(Buffer.from("GIF89a"))).toBeNull();
    expect(sniffDetectImage(Buffer.from("<svg></svg>"))).toBeNull();
  });

  it("matches ambiguous tool names only in software fields", () => {
    expect(matchAiTool("Adobe Firefly")).toBe("Adobe Firefly");
    expect(matchAiTool("A firefly at dusk", true)).toBeNull();
    expect(matchAiTool("Made with Midjourney", true)).toBe("Midjourney");
    expect(matchAiTool("Adobe Photoshop 25.0")).toBeNull();
  });
});
