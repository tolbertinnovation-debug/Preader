import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");

const { canonicalJson, seal, verifySeal } = await import("@/lib/detect/run");
const { detectionReportDocx } = await import("@/lib/detect/report");
const { buildTextResult } = await import("@/lib/detect/text");
const corpus = (await import("../eval/corpus/text.json")).default;

const text = corpus.items.find((i) => i.id === "ai-artifacts")!.text;
const result = buildTextResult(
  text,
  { status: "ok", name: "Test", output: { score: { provider: "Test model", ai: 0.97, mixed: 0.02, human: 0.01, confidence: "high" }, sentences: [{ text: "Reading is one of the most valuable habits a person can develop.", ai: 0.98 }] } },
  { id: "ABC-123", createdAt: "2026-01-01T00:00:00.000Z" },
);

describe("sealed results", () => {
  it("is independent of key order", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: null }] })).toBe(canonicalJson({ a: [{ c: null, d: 2 }], b: 1 }));
  });

  it("verifies an untouched result after a JSON round trip", () => {
    const sealed = seal(result);
    expect(verifySeal(JSON.parse(JSON.stringify(sealed)))).toBe(true);
  });

  it("rejects an edited result", () => {
    const sealed = JSON.parse(JSON.stringify(seal(result)));
    sealed.result.verdict = "likely_human";
    expect(verifySeal(sealed)).toBe(false);
    const rescored = JSON.parse(JSON.stringify(seal(result)));
    rescored.result.score.ai = 0.01;
    expect(verifySeal(rescored)).toBe(false);
  });
});

describe("report", () => {
  it("builds a Word document with the verdict and branding", async () => {
    const buf = await detectionReportDocx(result);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const { default: mammoth } = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    expect(value).toContain("Likely AI-generated");
    expect(value).toContain("Powered by Tolbert Innovation Hub");
    expect(value).toContain("97% AI likelihood");
    expect(value).toContain("not a certificate");
  });
});
