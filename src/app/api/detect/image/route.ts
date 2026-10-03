import { requireUser } from "@/lib/auth/session";
import { sniffDetectImage } from "@/lib/detect/image-meta";
import { detectImage, seal } from "@/lib/detect/run";
import { env } from "@/lib/env";
import { HttpError, assertSameOrigin, json } from "@/lib/http";
import { chargeDetection, rateLimit, refundUsage } from "@/lib/rate-limit";
import { route } from "@/lib/route";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Checks an image's Content Credentials, metadata and (if configured) a detection model.
 * The original bytes are analysed in memory and never stored or re-encoded.
 */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const max = env.detectMaxImageBytes;
  const tooLarge = `Images must be ${Math.round(max / 1024 / 1024)} MB or smaller. Please check the original file rather than a compressed copy if you can.`;
  if (Number(req.headers.get("content-length") ?? 0) > max + 64_000) throw new HttpError(413, "too_large", tooLarge);
  await rateLimit(`detect:${user.id}`, env.detectPerMinute, 60, "Please wait a moment before running another check.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "bad_upload", "We couldn't read that upload.");
  }
  const file = form.get("image");
  if (!(file instanceof File)) throw new HttpError(400, "no_file", "Choose an image to check.");
  if (file.size > max) throw new HttpError(413, "too_large", tooLarge);
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffDetectImage(buf);
  if (!kind) throw new HttpError(415, "unsupported", "Upload a JPG, PNG, WebP, HEIC or AVIF image.");

  const usageId = await chargeDetection(user.id, env.detectDailyLimit);
  try {
    return json(seal(await detectImage(buf, kind, file.name, req.signal)), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    await refundUsage(usageId).catch(() => {});
    throw err;
  }
});
