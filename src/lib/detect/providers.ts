// Adapters for third-party AI-detection models. Each one validates the provider's
// response strictly: if a number is missing or malformed, the check is reported as
// failed and no score is shown. PanPen never fills in or estimates a missing score.
import { z } from "zod";
import type { ModelOutcome, TextModelOutput } from "./text";
import type { ModelScore } from "./types";

type Fetch = typeof fetch;
// GPTZERO_API_URL / SIGHTENGINE_API_URL override the endpoints (set by the operator, for testing or a compatible gateway).
const TIMEOUT_MS = 25_000;
const prob = z.number().finite().min(0).max(1);

function withTimeout(signal?: AbortSignal): AbortSignal {
  const t = AbortSignal.timeout(TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, t]) : t;
}

function failure(name: string, err: unknown): { status: "error"; name: string; message: string } {
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return { status: "error", name, message: "the detection service took too long to respond" };
  if (err instanceof ProviderError) return { status: "error", name, message: err.message };
  console.error(`[preader] ${name} failed`, err);
  return { status: "error", name, message: "the detection service returned an unexpected response" };
}

class ProviderError extends Error {}

async function readJson(res: Response, name: string): Promise<unknown> {
  if (res.status === 401 || res.status === 403) throw new ProviderError(`${name} rejected PanPen's API key`);
  if (res.status === 429) throw new ProviderError(`${name} is rate-limiting requests; try again shortly`);
  if (!res.ok) throw new ProviderError(`${name} returned an error (HTTP ${res.status})`);
  return res.json();
}

// ---------- Text: GPTZero (https://gptzero.me) ----------

const GptZeroResponse = z.object({
  documents: z
    .array(
      z.object({
        class_probabilities: z.object({ ai: prob, human: prob, mixed: prob.optional() }).optional(),
        completely_generated_prob: prob.optional(),
        confidence_category: z.string().optional(),
        sentences: z.array(z.object({ sentence: z.string(), generated_prob: prob })).optional(),
      }),
    )
    .min(1),
});

export const GPTZERO_NAME = "GPTZero";

export function gptZeroConfigured(): boolean {
  return !!process.env.GPTZERO_API_KEY;
}

export async function detectTextGptZero(text: string, opts: { signal?: AbortSignal; fetchImpl?: Fetch } = {}): Promise<ModelOutcome<TextModelOutput>> {
  const key = process.env.GPTZERO_API_KEY;
  if (!key) return { status: "not_configured", name: GPTZERO_NAME, message: "No text-detection model is connected (set GPTZERO_API_KEY)." };
  try {
    const res = await (opts.fetchImpl ?? fetch)(process.env.GPTZERO_API_URL || "https://api.gptzero.me/v2/predict/text", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "x-api-key": key },
      body: JSON.stringify({ document: text, multilingual: false }),
      signal: withTimeout(opts.signal),
    });
    const parsed = GptZeroResponse.safeParse(await readJson(res, GPTZERO_NAME));
    if (!parsed.success) throw new ProviderError(`${GPTZERO_NAME} returned a response PanPen couldn't verify`);
    const doc = parsed.data.documents[0]!;
    let score: ModelScore;
    if (doc.class_probabilities) {
      const cp = doc.class_probabilities;
      score = { provider: GPTZERO_NAME, ai: cp.ai, human: cp.human, mixed: cp.mixed ?? null, confidence: doc.confidence_category ?? null };
    } else if (doc.completely_generated_prob !== undefined) {
      score = { provider: GPTZERO_NAME, ai: doc.completely_generated_prob, human: null, mixed: null, confidence: doc.confidence_category ?? null };
    } else {
      throw new ProviderError(`${GPTZERO_NAME} did not return a probability`);
    }
    return {
      status: "ok",
      name: GPTZERO_NAME,
      output: { score, sentences: (doc.sentences ?? []).map((s) => ({ text: s.sentence, ai: s.generated_prob })) },
    };
  } catch (err) {
    return failure(GPTZERO_NAME, err);
  }
}

// ---------- Images: Sightengine (https://sightengine.com) ----------

const SightengineResponse = z.object({
  status: z.literal("success"),
  type: z.object({ ai_generated: prob }),
});
const SightengineError = z.object({ status: z.literal("failure"), error: z.object({ message: z.string().optional() }).optional() });

export const SIGHTENGINE_NAME = "Sightengine";

export function sightengineConfigured(): boolean {
  return !!(process.env.SIGHTENGINE_API_USER && process.env.SIGHTENGINE_API_SECRET);
}

export async function detectImageSightengine(
  image: Buffer,
  mimeType: string,
  opts: { signal?: AbortSignal; fetchImpl?: Fetch } = {},
): Promise<ModelOutcome<{ score: ModelScore }>> {
  const user = process.env.SIGHTENGINE_API_USER;
  const secret = process.env.SIGHTENGINE_API_SECRET;
  if (!user || !secret) {
    return { status: "not_configured", name: SIGHTENGINE_NAME, message: "No image-detection model is connected (set SIGHTENGINE_API_USER and SIGHTENGINE_API_SECRET)." };
  }
  try {
    const form = new FormData();
    form.set("media", new Blob([new Uint8Array(image)], { type: mimeType }), "image");
    form.set("models", "genai");
    form.set("api_user", user);
    form.set("api_secret", secret);
    const res = await (opts.fetchImpl ?? fetch)(process.env.SIGHTENGINE_API_URL || "https://api.sightengine.com/1.0/check.json", { method: "POST", body: form, signal: withTimeout(opts.signal) });
    const body = await readJson(res, SIGHTENGINE_NAME);
    const err = SightengineError.safeParse(body);
    if (err.success) throw new ProviderError(`${SIGHTENGINE_NAME} couldn't analyse this image${err.data.error?.message ? ` (${err.data.error.message})` : ""}`);
    const parsed = SightengineResponse.safeParse(body);
    if (!parsed.success) throw new ProviderError(`${SIGHTENGINE_NAME} returned a response PanPen couldn't verify`);
    return { status: "ok", name: SIGHTENGINE_NAME, output: { score: { provider: SIGHTENGINE_NAME, ai: parsed.data.type.ai_generated, human: null, mixed: null, confidence: null } } };
  } catch (err) {
    return failure(SIGHTENGINE_NAME, err);
  }
}
