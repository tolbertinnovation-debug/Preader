import "server-only";
import OpenAI, { APIConnectionTimeoutError, APIError } from "openai";
import { env } from "../env";
import { HttpError } from "../http";
import { RESPONSE_SCHEMA } from "./prompt";

import { IncompleteError, type ModelSegmentOutput, type Provider, type RewriteCall } from "./types";

export { IncompleteError, type ModelSegmentOutput, type Provider };

function supportsReasoning(model: string) {
  return /^(o\d|gpt-5|gpt-6)/.test(model) && !model.includes("chat-latest");
}

let client: OpenAI | null = null;
function openai(): OpenAI {
  if (!env.openaiApiKey) throw new HttpError(503, "ai_unconfigured", "The writing service is not configured yet. Please contact the administrator.");
  client ??= new OpenAI({ apiKey: env.openaiApiKey, timeout: 180_000, maxRetries: 2 });
  return client;
}

function mapError(err: unknown): never {
  if (err instanceof HttpError || err instanceof IncompleteError) throw err;
  if (err instanceof Error && err.name === "AbortError") throw err;
  if (err instanceof APIConnectionTimeoutError) {
    throw new HttpError(504, "ai_timeout", "The writing service took too long to respond. Try a shorter passage or try again.");
  }
  if (err instanceof APIError) {
    console.error(`[preader] OpenAI error ${err.status ?? "?"}: ${err.code ?? err.type ?? "unknown"}`);
    if (err.status === 429) throw new HttpError(503, "ai_busy", "The writing service is busy right now. Please try again in a minute.");
    if (err.status === 400 && /context|too long|maximum/i.test(err.message)) {
      throw new HttpError(413, "ai_too_long", "That passage is too long to process at once. Try splitting it.");
    }
    if (err.status === 401 || err.status === 403) {
      throw new HttpError(503, "ai_unconfigured", "The writing service is not available right now. Please contact the administrator.");
    }
    throw new HttpError(502, "ai_error", "The writing service returned an error. Please try again.");
  }
  throw new HttpError(502, "ai_error", "Could not reach the writing service. Please try again.");
}

function parseOutput(text: string): ModelSegmentOutput[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpError(502, "ai_bad_output", "The writing service returned an unreadable response. Please try again.");
  }
  const segs = (data as { segments?: unknown }).segments;
  if (!Array.isArray(segs)) throw new HttpError(502, "ai_bad_output", "The writing service returned an unexpected response.");
  return segs.filter(
    (s): s is ModelSegmentOutput =>
      typeof s === "object" && s !== null && typeof (s as ModelSegmentOutput).id === "string" && typeof (s as ModelSegmentOutput).revised === "string",
  );
}

class OpenAIProvider implements Provider {
  model = env.model;

  async rewrite({ instructions, input, signal, safetyId }: RewriteCall) {
    try {
      const res = await openai().responses.create(
        {
          model: this.model,
          instructions,
          input,
          store: false,
          safety_identifier: safetyId,
          max_output_tokens: 32_000,
          ...(supportsReasoning(this.model) && env.reasoningEffort !== "none" ? { reasoning: { effort: env.reasoningEffort } } : {}),
          text: { format: { type: "json_schema", name: "revision", schema: RESPONSE_SCHEMA as unknown as Record<string, unknown>, strict: true } },
        },
        { signal },
      );
      if (res.status === "incomplete") throw new IncompleteError(res.incomplete_details?.reason ?? "incomplete");
      const refusal = res.output
        .flatMap((o) => (o.type === "message" ? o.content : []))
        .find((c) => c.type === "refusal");
      if (refusal) throw new HttpError(422, "ai_refused", "The writing service declined to edit this passage.");
      return parseOutput(res.output_text);
    } catch (err) {
      mapError(err);
    }
  }

  async embed(texts: string[], signal: AbortSignal) {
    if (!texts.length) return [];
    try {
      const res = await openai().embeddings.create({ model: env.embeddingModel, input: texts }, { signal });
      return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      // The semantic check is advisory: degrade gracefully rather than failing the rewrite.
      console.error("[preader] embedding check skipped:", err instanceof APIError ? err.status : "error");
      return null;
    }
  }
}

export async function getProvider(): Promise<Provider> {
  if (env.aiProvider === "mock") {
    const { MockProvider } = await import("./mock");
    return new MockProvider();
  }
  return new OpenAIProvider();
}
