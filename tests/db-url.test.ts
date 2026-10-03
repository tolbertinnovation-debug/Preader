import { describe, expect, it } from "vitest";
import { resolveAppUrl, resolveDatabaseUrl } from "@/lib/db-url";

const POOLED = "postgresql://u:p@ep-x-pooler.eu-west-2.aws.neon.tech/db?sslmode=require";
const DIRECT = "postgresql://u:p@ep-x.eu-west-2.aws.neon.tech/db?sslmode=require";

describe("resolveDatabaseUrl", () => {
  it("uses DATABASE_URL when present", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: POOLED, OTHER: "x" })).toBe(POOLED);
  });
  it("finds a prefixed Neon variable such as STORAGE_URL", () => {
    expect(resolveDatabaseUrl({ STORAGE_URL: POOLED, STORAGE_URL_UNPOOLED: DIRECT, NODE_ENV: "production" })).toBe(POOLED);
  });
  it("prefers the unpooled connection for migrations", () => {
    expect(resolveDatabaseUrl({ STORAGE_URL: POOLED, STORAGE_URL_UNPOOLED: DIRECT }, "direct")).toBe(DIRECT);
    expect(resolveDatabaseUrl({ DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: DIRECT }, "direct")).toBe(DIRECT);
  });
  it("ignores non-postgres values and returns undefined when none exist", () => {
    expect(resolveDatabaseUrl({ REDIS_URL: "redis://x", APP_URL: "https://a" })).toBeUndefined();
  });
});

describe("resolveAppUrl", () => {
  it("prefers APP_URL, then Vercel's production domain", () => {
    expect(resolveAppUrl({ APP_URL: "https://preader.org", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" })).toBe("https://preader.org");
    expect(resolveAppUrl({ VERCEL_PROJECT_PRODUCTION_URL: "preader-olive.vercel.app" })).toBe("https://preader-olive.vercel.app");
    expect(resolveAppUrl({})).toBe("");
  });
});
