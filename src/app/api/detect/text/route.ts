import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { detectText, seal } from "@/lib/detect/run";
import { DETECT_LIMITS } from "@/lib/detect/types";
import { env } from "@/lib/env";
import { HttpError, assertSameOrigin, json, parseJson } from "@/lib/http";
import { chargeDetection, rateLimit, refundUsage } from "@/lib/rate-limit";
import { route } from "@/lib/route";
import { countWords } from "@/lib/text/words";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ text: z.string().trim().min(1, "Paste some text to check.").max(DETECT_LIMITS.maxChars, "That text is too long to check at once.") });

/** Checks text for signs of AI generation. Nothing is stored. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await rateLimit(`detect:${user.id}`, env.detectPerMinute, 60, "Please wait a moment before running another check.");
  const { text } = await parseJson(req, Body, DETECT_LIMITS.maxChars * 4 + 1000);
  const words = countWords(text);
  if (words > DETECT_LIMITS.maxWords) {
    throw new HttpError(413, "too_long", `Please check up to ${DETECT_LIMITS.maxWords.toLocaleString()} words at a time (this has ${words.toLocaleString()}).`);
  }
  const usageId = await chargeDetection(user.id, env.detectDailyLimit);
  try {
    return json(seal(await detectText(text, req.signal)), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    await refundUsage(usageId).catch(() => {});
    throw err;
  }
});
