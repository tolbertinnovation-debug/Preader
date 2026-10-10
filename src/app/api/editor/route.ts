import { requireUser } from "@/lib/auth/session";
import { getProvider, requestStructured } from "@/lib/ai/provider";
import { sha256, tryDecrypt } from "@/lib/crypto";
import { queryOne } from "@/lib/db";
import { env } from "@/lib/env";
import { editorRequestSchema, EDITOR_MAX_WORDS, EditorFeedbackError, runEditor } from "@/lib/editor/review";
import { assertSameOrigin, HttpError, json, parseJson } from "@/lib/http";
import { resolveOptions } from "@/lib/preferences";
import { assertWordQuota, rateLimit, recordUsage, refundUsage } from "@/lib/rate-limit";
import { route } from "@/lib/route";
import { segmentDocument } from "@/lib/text/segment";
import { countWords } from "@/lib/text/words";
import { readPinned } from "@/lib/voice-store";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const body = await parseJson(req, editorRequestSchema, 300000);
  const words = countWords(body.text);
  const limit = Math.min(EDITOR_MAX_WORDS, env.maxWordsPerRequest);
  if (words > limit) throw new HttpError(413, "too_many_words", `The editor accepts up to ${limit.toLocaleString()} words. Split your writing into sections.`);
  if (!segmentDocument(body.text).some((s) => s.kind === "text")) {
    throw new HttpError(400, "empty", "Add some paragraphs to edit. Headings and reference lists are kept as written.");
  }
  await rateLimit(`rewrite:${user.id}`, env.rewritesPerMinute, 60, "Please wait a moment before requesting another edit.");
  await assertWordQuota(user.id, words);
  const usageId = await recordUsage(user.id, "rewrite", words);
  const abort = new AbortController();
  const cancel = () => abort.abort();
  req.signal.addEventListener("abort", cancel, { once: true });
  if (req.signal.aborted) abort.abort();
  const timeout = setTimeout(cancel, 280000);
  let phase = "preferences";
  try {
    await assertWordQuota(user.id, words, words);
    const voice = await queryOne<{ voice_sample_enc: string | null; voice_phrases_enc: string | null }>(
      "SELECT voice_sample_enc, voice_phrases_enc FROM users WHERE id = $1", [user.id],
    );
    const result = await runEditor({
      body, defaults: resolveOptions(user.preferences), provider: await getProvider(), feedback: requestStructured,
      voiceSample: body.useVoiceSample ? tryDecrypt(voice?.voice_sample_enc) : null,
      voicePhrases: readPinned(voice?.voice_phrases_enc), safetyId: sha256(`preader:${user.id}`).slice(0, 32),
      signal: abort.signal, meaningCheck: env.meaningCheck, onPhase: (value) => { phase = value; },
    });
    if (!result.revision) await refundUsage(usageId);
    return json(result);
  } catch (err) {
    abort.abort();
    await refundUsage(usageId).catch(() => {});
    if (err instanceof HttpError) throw err;
    if (err instanceof EditorFeedbackError) throw new HttpError(502, `editor_${err.phase}_invalid`, err.message);
    // Content-free diagnostics: never log drafts, feedback or raw database errors.
    console.error("[preader] editor failed", { phase, type: err instanceof Error ? err.name : "unknown" });
    throw new HttpError(abort.signal.aborted && req.signal.aborted ? 499 : 502, "editor_failed", `The editor could not complete the ${phase} step. Please try again. If this continues, contact support and mention editor_${phase}_failed.`);
  } finally {
    clearTimeout(timeout);
    req.signal.removeEventListener("abort", cancel);
  }
});
