import "server-only";
import { query, queryOne } from "./db";
import { HttpError } from "./http";
import { env } from "./env";

/**
 * Fixed-window counter stored in Postgres so limits hold across every app instance.
 * Throws a 429 HttpError with Retry-After when the limit is exceeded.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number, message?: string) {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const row = await queryOne<{ count: number }>(
    `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, $2, 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
     RETURNING count`,
    [key, windowStart],
  );
  if (Math.random() < 0.02) {
    void query("DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'").catch(() => {});
  }
  if ((row?.count ?? 0) > limit) {
    const retryAfter = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000));
    throw new HttpError(429, "rate_limited", message ?? `Too many requests. Please wait ${retryAfter}s and try again.`, {
      "Retry-After": String(retryAfter),
    });
  }
}

export async function wordsUsedToday(userId: string): Promise<number> {
  const row = await queryOne<{ total: string | null }>(
    "SELECT COALESCE(SUM(words), 0) AS total FROM usage_events WHERE user_id = $1 AND created_at > now() - interval '24 hours'",
    [userId],
  );
  return Number(row?.total ?? 0);
}

export async function assertWordQuota(userId: string, words: number) {
  const used = await wordsUsedToday(userId);
  if (used + words > env.dailyWordLimit) {
    const left = Math.max(0, env.dailyWordLimit - used);
    throw new HttpError(
      429,
      "quota_exceeded",
      `This would exceed your daily limit of ${env.dailyWordLimit.toLocaleString()} words (${left.toLocaleString()} left in the last 24 hours).`,
    );
  }
}

export async function recordUsage(userId: string, kind: string, words: number) {
  await query("INSERT INTO usage_events (user_id, kind, words) VALUES ($1, $2, $3)", [userId, kind, words]);
}
