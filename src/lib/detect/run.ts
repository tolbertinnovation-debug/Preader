import "server-only";
import { randomUUID } from "node:crypto";
import { sha256, sign, verifySignature } from "@/lib/crypto";
import { countWords } from "@/lib/text/words";
import { readContentCredentials } from "./c2pa";
import { buildImageResult } from "./image";
import { DETECT_IMAGE_MIME, readImageMeta, type DetectImageKind } from "./image-meta";
import { detectImageSightengine, detectTextGptZero, GPTZERO_NAME } from "./providers";
import { buildTextResult } from "./text";
import { DETECT_LIMITS, type DetectResult, type ImageResult, type Sealed, type TextResult } from "./types";

const SEAL_PURPOSE = "detect-report/v1";

function meta() {
  return { id: randomUUID().slice(0, 13).toUpperCase(), createdAt: new Date().toISOString() };
}

export async function detectText(text: string, signal?: AbortSignal): Promise<TextResult> {
  const words = countWords(text);
  const outcome =
    words < DETECT_LIMITS.minWords
      ? ({ status: "skipped", name: GPTZERO_NAME, message: `Skipped: fewer than ${DETECT_LIMITS.minWords} words.` } as const)
      : await detectTextGptZero(text, { signal });
  return buildTextResult(text, outcome, meta());
}

export async function detectImage(buf: Buffer, kind: DetectImageKind, name: string, signal?: AbortSignal): Promise<ImageResult> {
  const mime = DETECT_IMAGE_MIME[kind];
  // All three checks run in parallel; each reports its own failure instead of throwing.
  const [m, c2pa, model] = await Promise.all([readImageMeta(buf, kind), readContentCredentials(buf, mime), detectImageSightengine(buf, mime, { signal })]);
  return buildImageResult({
    file: { name: name.slice(0, 120) || "image", type: mime, bytes: buf.length, sha256: sha256(buf), width: m.width, height: m.height },
    meta: m,
    c2pa,
    model,
    ...meta(),
  });
}

/** JSON with object keys sorted, so the seal doesn't depend on key order after a round trip. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function seal<T extends DetectResult>(result: T): Sealed<T> {
  return { result, seal: sign(SEAL_PURPOSE, canonicalJson(result)) };
}

export function verifySeal(sealed: { result: unknown; seal: string }): boolean {
  return verifySignature(SEAL_PURPOSE, canonicalJson(sealed.result), sealed.seal);
}
