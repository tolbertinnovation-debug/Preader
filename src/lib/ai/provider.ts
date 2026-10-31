import "server-only";
import { env } from "../env";
import { HttpError } from "../http";
import { chatCompletion, extractJson, LlamaApiError, LlamaTimeoutError, type ClientOptions } from "./llama";
import { RESPONSE_SCHEMA } from "./prompt";

import { IncompleteError, type ModelSegmentOutput, type Provider, type RewriteCall } from "./types";

export { IncompleteError, type ModelSegmentOutput, type Provider };

export function mapError(err: unknown): never {
  if (err instanceof HttpError || err instanceof IncompleteError) throw err;
  if (err instanceof Error && err.name === "AbortError") throw err;
  if (err instanceof LlamaTimeoutError) {
    throw new HttpError(504, "ai_timeout", "The writing service took too long to respond. Try a shorter passage or try again.");
  }
  if (err instanceof LlamaApiError) {
    console.error(`[preader] Llama API error ${err.status}`);
    if (err.status === 429) throw new HttpError(503, "ai_busy", "The writing service is busy right now. Please try again in a minute.");
    if ((err.status === 400 || err.status === 413) && /context|too long|maximum|token/i.test(err.message)) {
      throw new HttpError(413, "ai_too_long", "That passage is too long to process at once. Try splitting it.");
    }
    if (err.status === 401 || err.status === 403) {
      throw new HttpError(503, "ai_unconfigured", "The writing service is not available right now. Please contact the administrator.");
    }
    if (err.status === 400 && /safety|moderation|policy|violat/i.test(err.message)) {
      throw new HttpError(422, "ai_refused", "The writing service declined to edit this passage.");
    }
    throw new HttpError(502, "ai_error", "The writing service returned an error. Please try again.");
  }
  throw new HttpError(502, "ai_error", "Could not reach the writing service. Please try again.");
}

export function parseOutput(text: string): ModelSegmentOutput[] {
  let data: unknown;
  try {
    data = extractJson(text);
  } catch {
    throw new HttpError(502, "ai_bad_output", "The writing service returned an unreadable response. Please try again.");
  }
  const segs = (data as { segments?: unknown } | null)?.segments;
  if (!Array.isArray(segs)) throw new HttpError(502, "ai_bad_output", "The writing service returned an unexpected response.");
  return segs
    .filter(
      (s): s is ModelSegmentOutput =>
        typeof s === "object" && s !== null && typeof (s as ModelSegmentOutput).id === "string" && typeof (s as ModelSegmentOutput).revised === "string",
    )
    .map((s) => ({
      id: s.id,
      revised: s.revised,
      changes: typeof s.changes === "string" ? s.changes : "",
      meaning_risk: s.meaning_risk === "low" || s.meaning_risk === "high" ? s.meaning_risk : "none",
      risk_note: typeof s.risk_note === "string" ? s.risk_note : "",
    }));
}

export class LlamaProvider implements Provider {
  model: string;

  /** `client` overrides the connection settings (used by tests). */
  constructor(private client?: ClientOptions) {
    this.model = env.model;
  }

  async rewrite({ instructions, input, signal }: RewriteCall) {
    if (!(this.client?.apiKey ?? env.llamaApiKey)) {
      throw new HttpError(503, "ai_unconfigured", "The writing service is not configured yet. Please contact the administrator.");
    }
    try {
      const res = await chatCompletion(
        {
          model: this.model,
          messages: [
            { role: "system", content: instructions },
            { role: "user", content: input },
          ],
          max_completion_tokens: env.maxOutputTokens,
          temperature: 0.5,
          response_format: { type: "json_schema", json_schema: { name: "revision", schema: RESPONSE_SCHEMA as unknown as Record<string, unknown> } },
        },
        signal,
        this.client,
      );
      const choice = res.choices?.[0];
      if (choice?.finish_reason === "length") throw new IncompleteError("max_tokens");
      if (choice?.message?.refusal) throw new HttpError(422, "ai_refused", "The writing service declined to edit this passage.");
      if (choice?.finish_reason === "content_filter") throw new HttpError(422, "ai_refused", "The writing service declined to edit this passage.");
      return parseOutput(choice?.message?.content ?? "");
    } catch (err) {
      mapError(err);
    }
  }

  /**
   * The Llama API has no embeddings endpoint, so the embedding-based meaning-drift check
   * is skipped. Meaning is still protected by placeholders and the other verify checks.
   */
  async embed(): Promise<null> {
    return null;
  }
}

export async function getProvider(): Promise<Provider> {
  if (env.aiProvider === "mock") {
    const { MockProvider } = await import("./mock");
    return new MockProvider();
  }
  return new LlamaProvider();
}
