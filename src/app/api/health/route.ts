import { resolveDatabaseUrl } from "@/lib/db-url";
import { queryOne } from "@/lib/db";
import { emailConfigured } from "@/lib/email/send";
import { env } from "@/lib/env";
import { json } from "@/lib/http";

type Status = "ok" | "missing" | "invalid" | "unreachable" | "not set up";

/**
 * Setup checklist for whoever deploys Preader. Reports only whether each piece is
 * configured — never any value, secret or error detail.
 */
export async function GET() {
  const checks: Record<string, Status> = {};

  if (!resolveDatabaseUrl()) {
    checks.database = "missing";
  } else {
    try {
      await queryOne("SELECT 1");
      checks.database = "ok";
      const row = await queryOne<{ ready: boolean }>("SELECT to_regclass('public.users') IS NOT NULL AS ready");
      checks.tables = row?.ready ? "ok" : "not set up";
    } catch {
      checks.database = "unreachable";
    }
  }

  const key = process.env.ENCRYPTION_KEY;
  checks.encryptionKey = !key ? "missing" : Buffer.from(key, "base64").length === 32 ? "ok" : "invalid";
  let mock = false;
  try {
    mock = env.aiProvider === "mock";
  } catch {
    /* mock provider refused in production: fall through to the real key check */
  }
  checks.openaiKey = mock || process.env.OPENAI_API_KEY ? "ok" : "missing";
  checks.email = emailConfigured() ? "ok" : "not set up";

  const required = ["database", "tables", "encryptionKey", "openaiKey"];
  const ok = required.every((k) => checks[k] === "ok");
  return json({ ok, checks }, { status: ok ? 200 : 503 });
}
