import { runRewrite } from "@/lib/ai/rewrite";
import { getProvider } from "@/lib/ai/provider";
import { requireUser } from "@/lib/auth/session";
import { decrypt, sha256 } from "@/lib/crypto";
import { queryOne } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError, assertSameOrigin, parseJson } from "@/lib/http";
import { deriveTitle, saveRewrite } from "@/lib/history";
import { assertWordQuota, rateLimit, recordUsage } from "@/lib/rate-limit";
import { route } from "@/lib/route";
import { segmentDocument } from "@/lib/text/segment";
import { countWords } from "@/lib/text/words";
import { rewriteRequestSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const body = await parseJson(req, rewriteRequestSchema, 600_000);

  const segments = segmentDocument(body.text);
  const editable = segments.filter((s) => s.kind === "text");
  if (!editable.length) throw new HttpError(400, "empty", "Add some paragraphs to rewrite. Headings and reference lists are kept as they are.");
  const words = editable.reduce((n, s) => n + countWords(s.text), 0);
  if (words > env.maxWordsPerRequest) {
    throw new HttpError(
      413,
      "too_many_words",
      `This document has ${words.toLocaleString()} words to rewrite; the limit per run is ${env.maxWordsPerRequest.toLocaleString()}. Split it into sections.`,
    );
  }
  await rateLimit(`rewrite:${user.id}`, env.rewritesPerMinute, 60, "You're rewriting very quickly. Please wait a moment and try again.");
  await assertWordQuota(user.id, words);

  let voiceSample: string | null = null;
  if (body.options.useVoiceSample) {
    const row = await queryOne<{ voice_sample_enc: string | null }>("SELECT voice_sample_enc FROM users WHERE id = $1", [user.id]);
    voiceSample = row?.voice_sample_enc ? decrypt(row.voice_sample_enc) : null;
  }

  const provider = await getProvider();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        } catch {
          /* client went away */
        }
      };
      // Keep proxies from closing an idle connection while the model is thinking.
      const heartbeat = setInterval(() => send({ type: "ping" }), 15_000);
      try {
        for await (const event of runRewrite({
          text: body.text,
          title: body.title,
          options: body.options,
          voiceSample,
          provider,
          safetyId: sha256(`preader:${user.id}`).slice(0, 32),
          signal: abort.signal,
          meaningCheck: env.meaningCheck,
        })) {
          if (event.type === "done") {
            await recordUsage(user.id, "rewrite", words);
            let historyId: string | null = null;
            if (!body.options.privateMode) {
              historyId = await saveRewrite({
                userId: user.id,
                title: deriveTitle(body.text, body.title),
                original: body.text,
                options: body.options,
                results: event.results,
                summary: event.summary,
              });
            }
            send({ type: "done", summary: event.summary, historyId });
          } else {
            send(event);
          }
        }
      } catch (err) {
        abort.abort();
        if (!(err instanceof Error && err.name === "AbortError")) {
          const e =
            err instanceof HttpError
              ? { code: err.code, message: err.message }
              : { code: "internal", message: "Something went wrong while rewriting. Please try again." };
          if (!(err instanceof HttpError)) console.error("[preader] rewrite failed:", err instanceof Error ? err.message : "unknown");
          send({ type: "error", error: e });
        }
      } finally {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
});
