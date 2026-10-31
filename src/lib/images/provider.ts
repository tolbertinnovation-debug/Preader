import "server-only";
import { env } from "../env";
import { HttpError } from "../http";
import type { ImageKind } from "./validate";

export type HumanizeInput = {
  image: Buffer;
  kind: ImageKind;
  width: number;
  height: number;
  prompt: string;
  signal: AbortSignal;
};

export type HumanizeOutput = { image: Buffer; contentType: "image/jpeg"; model: string };

export const IMAGE_UNAVAILABLE_MESSAGE =
  "The Image Humanizer isn't available right now. PanPen's AI provider (Meta's Llama API) can read images but can't edit them.";

/** True when an image-editing backend is configured. The Llama API has none; only the dev mock does. */
export function imageEditingAvailable(): boolean {
  try {
    return env.aiProvider === "mock";
  } catch {
    return false;
  }
}

export async function humanizeImage(input: HumanizeInput): Promise<HumanizeOutput> {
  if (!imageEditingAvailable()) throw new HttpError(503, "image_unavailable", IMAGE_UNAVAILABLE_MESSAGE);
  // Development only: echo the upload after a short delay so the UI can be exercised offline.
  await new Promise((r) => setTimeout(r, 1200));
  return { image: input.image, contentType: "image/jpeg", model: "mock-image" };
}
