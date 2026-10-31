import "server-only";
import { env } from "../env";

/**
 * Minimal client for Meta's Llama API, using its OpenAI-compatible chat completions
 * endpoint (https://api.llama.com/compat/v1). Plain fetch: no SDK dependency.
 */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  max_completion_tokens?: number;
  temperature?: number;
  response_format?: { type: "json_schema"; json_schema: { name: string; schema: Record<string, unknown> } };
};

export type ChatResponse = {
  choices?: { finish_reason?: string | null; message?: { content?: string | null; refusal?: string | null } }[];
};

/** The API answered with a non-2xx status. `message` is the provider's text, for logs only. */
export class LlamaApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "LlamaApiError";
  }
}

/** The request didn't finish within the timeout. */
export class LlamaTimeoutError extends Error {
  constructor() {
    super("Llama API request timed out");
    this.name = "LlamaTimeoutError";
  }
}

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504]);

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(abortError());
    });
  });
}

function abortError() {
  return Object.assign(new Error("aborted"), { name: "AbortError" });
}

export type ClientOptions = {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  fetchImpl?: typeof fetch;
};

export function defaultClientOptions(): ClientOptions {
  return { apiKey: env.llamaApiKey, baseUrl: env.llamaBaseUrl, timeoutMs: 180_000, maxRetries: 2 };
}

/**
 * POSTs a chat completion. Retries network errors, 429 and 5xx with exponential
 * backoff (honouring Retry-After). A caller abort propagates as an AbortError.
 */
export async function chatCompletion(body: ChatRequest, signal: AbortSignal, opts: ClientOptions = defaultClientOptions()): Promise<ChatResponse> {
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${opts.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  let attempt = 0;
  for (;;) {
    const timeout = AbortSignal.timeout(opts.timeoutMs);
    let res: Response;
    try {
      res = await doFetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.any([signal, timeout]),
      });
    } catch (err) {
      if (signal.aborted) throw abortError();
      if (timeout.aborted) throw new LlamaTimeoutError();
      if (attempt < opts.maxRetries) {
        await sleep(backoff(attempt++), signal);
        continue;
      }
      throw err;
    }
    if (res.ok) return (await res.json()) as ChatResponse;

    const text = await res.text().catch(() => "");
    if (RETRYABLE.has(res.status) && attempt < opts.maxRetries) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 20) * 1000 : backoff(attempt), signal);
      attempt++;
      continue;
    }
    throw new LlamaApiError(res.status, errorMessage(text));
  }
}

function backoff(attempt: number) {
  return Math.min(8000, 500 * 2 ** attempt) + Math.random() * 250;
}

function errorMessage(body: string): string {
  try {
    const data = JSON.parse(body) as { error?: { message?: string } | string; detail?: string; message?: string };
    const e = data.error;
    return (typeof e === "string" ? e : e?.message) ?? data.detail ?? data.message ?? body.slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
}

/**
 * Extracts a JSON object from model output. Structured output normally returns bare JSON,
 * but this tolerates a ```json fence or stray text around the object.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]!.trim());
    } catch {
      /* fall through */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new SyntaxError("No JSON object in model output");
}
