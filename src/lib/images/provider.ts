import "server-only";
import OpenAI, { APIConnectionTimeoutError, APIError, toFile } from "openai";
import { env } from "../env";
import { HttpError } from "../http";
import { supportsCustomSize, targetSize } from "./size";
import type { ImageKind } from "./validate";

export type HumanizeInput = {
  image: Buffer;
  kind: ImageKind;
  width: number;
  height: number;
  prompt: string;
  safetyId: string;
  signal: AbortSignal;
};

export type HumanizeOutput = { image: Buffer; contentType: "image/jpeg"; model: string };

let client: OpenAI | null = null;
function openai(): OpenAI {
  if (!env.openaiApiKey) throw new HttpError(503, "ai_unconfigured", "The image service is not configured yet. Please contact the administrator.");
  client ??= new OpenAI({ apiKey: env.openaiApiKey, timeout: 280_000, maxRetries: 1 });
  return client;
}

function mapError(err: unknown): never {
  if (err instanceof HttpError) throw err;
  if (err instanceof Error && err.name === "AbortError") throw err;
  if (err instanceof APIConnectionTimeoutError) {
    throw new HttpError(504, "ai_timeout", "The image took too long to process. Try again, or use a smaller image.");
  }
  if (err instanceof APIError) {
    console.error(`[preader] OpenAI image error ${err.status ?? "?"}: ${err.code ?? err.type ?? "unknown"}`);
    const code = String(err.code ?? "");
    if (code.includes("moderation") || code.includes("safety") || /safety|moderation/i.test(err.message)) {
      throw new HttpError(422, "image_blocked", "This image can't be edited because it may break the content rules (for example nudity, violence or real-person misuse).");
    }
    if (err.status === 429) throw new HttpError(503, "ai_busy", "The image service is busy right now. Please try again in a minute.");
    if (err.status === 401 || err.status === 403) {
      throw new HttpError(503, "ai_unconfigured", "The image service is not available right now. Please contact the administrator.");
    }
    if (err.status === 400) throw new HttpError(422, "image_rejected", "The image service couldn't process this image. Try a different image or format.");
    throw new HttpError(502, "ai_error", "The image service returned an error. Please try again.");
  }
  throw new HttpError(502, "ai_error", "Could not reach the image service. Please try again.");
}

async function editOnce(input: HumanizeInput, size: string): Promise<Buffer> {
  const model = env.imageModel;
  const res = await openai().images.edit(
    {
      model,
      image: await toFile(input.image, `upload.${input.kind === "jpeg" ? "jpg" : input.kind}`, { type: `image/${input.kind}` }),
      prompt: input.prompt,
      n: 1,
      size,
      quality: "high",
      output_format: "jpeg",
      output_compression: 95,
      // Ignored by models that always edit at high fidelity; keeps faces intact on the rest.
      ...(supportsCustomSize(model) ? {} : { input_fidelity: "high" as const }),
      user: input.safetyId,
    },
    { signal: input.signal },
  );
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new HttpError(502, "ai_bad_output", "The image service returned no image. Please try again.");
  return Buffer.from(b64, "base64");
}

export async function humanizeImage(input: HumanizeInput): Promise<HumanizeOutput> {
  if (env.aiProvider === "mock") {
    // Development only: echo the upload after a short delay so the UI can be exercised offline.
    await new Promise((r) => setTimeout(r, 1200));
    return { image: input.image, contentType: "image/jpeg", model: "mock-image" };
  }
  const model = env.imageModel;
  const size = supportsCustomSize(model) ? targetSize(input.width, input.height) : "auto";
  try {
    return { image: await editOnce(input, size), contentType: "image/jpeg", model };
  } catch (err) {
    // If a custom resolution is refused, retry once letting the model choose the size.
    if (size !== "auto" && err instanceof APIError && err.status === 400 && /size|resolution|dimension/i.test(err.message)) {
      try {
        return { image: await editOnce(input, "auto"), contentType: "image/jpeg", model };
      } catch (retryErr) {
        mapError(retryErr);
      }
    }
    mapError(err);
  }
}
