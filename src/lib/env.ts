import "server-only";
import { resolveAppUrl, resolveDatabaseUrl } from "./db-url";

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

const isProd = process.env.NODE_ENV === "production";

export const env = {
  isProd,
  get databaseUrl() {
    const url = resolveDatabaseUrl();
    if (!url) throw new Error("Missing database connection: set DATABASE_URL");
    return url;
  },
  get llamaApiKey() {
    return process.env.LLAMA_API_KEY ?? "";
  },
  /** Meta Llama API, OpenAI-compatible endpoint. */
  llamaBaseUrl: process.env.LLAMA_BASE_URL || "https://api.llama.com/compat/v1",
  get encryptionKey() {
    return required("ENCRYPTION_KEY");
  },
  appUrl: resolveAppUrl(),
  /** Rewriting model. Llama 4 Maverick is the strongest Llama API model for writing. */
  model: process.env.LLAMA_MODEL || "Llama-4-Maverick-17B-128E-Instruct-FP8",
  maxOutputTokens: int("LLAMA_MAX_OUTPUT_TOKENS", 4096),
  /** Embedding meaning check: only the dev mock provides embeddings (the Llama API has none). */
  meaningCheck: process.env.MEANING_CHECK !== "false",
  imageDailyLimit: int("IMAGE_DAILY_LIMIT", 10),
  imagesPerMinute: int("IMAGES_PER_MINUTE", 3),
  maxWordsPerRequest: int("MAX_WORDS_PER_REQUEST", 8000),
  dailyWordLimit: int("DAILY_WORD_LIMIT", 50000),
  rewritesPerMinute: int("REWRITES_PER_MINUTE", 8),
  detectDailyLimit: int("DETECT_DAILY_LIMIT", 60),
  detectPerMinute: int("DETECT_PER_MINUTE", 8),
  /** Vercel caps request bodies at 4.5 MB, so uploads stay at 4 MB there whatever is configured. */
  detectMaxImageBytes: Math.min(int("DETECT_MAX_IMAGE_MB", 4), process.env.VERCEL ? 4 : 25) * 1024 * 1024,
  allowSignups: process.env.ALLOW_SIGNUPS !== "false",
  get aiProvider(): "llama" | "mock" {
    const p = process.env.AI_PROVIDER === "mock" ? "mock" : "llama";
    if (p === "mock" && isProd && process.env.ALLOW_MOCK_IN_PRODUCTION !== "true") {
      throw new Error("AI_PROVIDER=mock is not allowed in production");
    }
    return p;
  },
};
