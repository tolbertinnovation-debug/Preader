import { requireUser } from "@/lib/auth/session";
import { sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { HttpError, assertSameOrigin } from "@/lib/http";
import { IMAGE_FOCUS, IMAGE_LIMITS, IMAGE_SUBJECTS, type ImageFocus, type ImageStrength, type ImageSubject } from "@/lib/images/options";
import { buildImagePrompt } from "@/lib/images/prompt";
import { humanizeImage } from "@/lib/images/provider";
import { sniffImage } from "@/lib/images/validate";
import { imagesUsedToday, rateLimit, recordUsage, refundUsage } from "@/lib/rate-limit";
import { route } from "@/lib/route";

export const runtime = "nodejs";
export const maxDuration = 300;

function intField(form: FormData, name: string, min: number, max: number): number {
  const n = Number(form.get(name));
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, "invalid", `Invalid ${name}.`);
  return n;
}

/**
 * Humanizes one image. Images are processed in memory only: nothing is written to
 * the database or disk, and the result streams straight back to the user.
 */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  if (Number(req.headers.get("content-length") ?? 0) > IMAGE_LIMITS.maxUploadBytes + 64_000) {
    throw new HttpError(413, "too_large", "That image is too large. Please try a smaller one.");
  }
  await rateLimit(`image:${user.id}`, env.imagesPerMinute, 60, "Please wait a moment before humanizing another image.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "bad_upload", "We couldn't read that upload.");
  }
  if (form.get("consent") !== "true") {
    throw new HttpError(400, "consent_required", "Please confirm you have the right to edit this image.");
  }
  const file = form.get("image");
  if (!(file instanceof File)) throw new HttpError(400, "no_file", "Choose an image to upload.");
  if (file.size > IMAGE_LIMITS.maxUploadBytes) throw new HttpError(413, "too_large", "That image is too large. Please try a smaller one.");
  const image = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(image);
  if (!kind) throw new HttpError(415, "unsupported", "Upload a JPG, PNG or WebP image.");

  const width = intField(form, "width", IMAGE_LIMITS.minEdge / 4, 8192);
  const height = intField(form, "height", IMAGE_LIMITS.minEdge / 4, 8192);
  const strength = intField(form, "strength", 1, 3) as ImageStrength;
  const subjectRaw = String(form.get("subject") ?? "people");
  if (!(subjectRaw in IMAGE_SUBJECTS)) throw new HttpError(400, "invalid", "Invalid subject.");
  const subject = subjectRaw as ImageSubject;
  const focus = String(form.get("focus") ?? "")
    .split(",")
    .filter((f): f is ImageFocus => f in IMAGE_FOCUS);

  // Count first, then check, so simultaneous requests can't jointly exceed the daily limit.
  const usageId = await recordUsage(user.id, "image", 0);
  if ((await imagesUsedToday(user.id)) > env.imageDailyLimit) {
    await refundUsage(usageId);
    throw new HttpError(429, "quota_exceeded", `You've reached today's limit of ${env.imageDailyLimit} images. Please try again tomorrow.`);
  }
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());
  try {
    const out = await humanizeImage({
      image,
      kind,
      width,
      height,
      prompt: buildImagePrompt({ subject, strength, focus }),
      safetyId: sha256(`preader:${user.id}`).slice(0, 32),
      signal: abort.signal,
    });
    return new Response(new Uint8Array(out.image), {
      headers: {
        "Content-Type": out.contentType,
        "Content-Length": String(out.image.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    await refundUsage(usageId).catch(() => {});
    throw err;
  }
});
