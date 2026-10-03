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
  get openaiApiKey() {
    return process.env.OPENAI_API_KEY ?? "";
  },
  get encryptionKey() {
    return required("ENCRYPTION_KEY");
  },
  appUrl: resolveAppUrl(),
  model: process.env.OPENAI_MODEL || "gpt-5.5",
  reasoningEffort: (process.env.OPENAI_REASONING_EFFORT || "medium") as
    | "none"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh",
  embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large",
  meaningCheck: process.env.MEANING_CHECK !== "false",
  imageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
  imageDailyLimit: int("IMAGE_DAILY_LIMIT", 10),
  imagesPerMinute: int("IMAGES_PER_MINUTE", 3),
  maxWordsPerRequest: int("MAX_WORDS_PER_REQUEST", 8000),
  dailyWordLimit: int("DAILY_WORD_LIMIT", 50000),
  rewritesPerMinute: int("REWRITES_PER_MINUTE", 8),
  allowSignups: process.env.ALLOW_SIGNUPS !== "false",
  get aiProvider(): "openai" | "mock" {
    const p = process.env.AI_PROVIDER === "mock" ? "mock" : "openai";
    if (p === "mock" && isProd && process.env.ALLOW_MOCK_IN_PRODUCTION !== "true") {
      throw new Error("AI_PROVIDER=mock is not allowed in production");
    }
    return p;
  },
};
