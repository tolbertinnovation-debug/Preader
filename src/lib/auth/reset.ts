import "server-only";
import { randomToken, sha256 } from "../crypto";
import { query, queryOne } from "../db";
import { emailConfigured, sendEmail } from "../email/send";
import { passwordChangedEmail, passwordResetEmail } from "../email/templates";
import { env } from "../env";
import { HttpError } from "../http";

export const RESET_TTL_MINUTES = 30;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;

/**
 * The origin used in emailed links. In production it must come from APP_URL —
 * never from the request's Host header, which an attacker could forge to
 * have reset links point at their own site.
 */
export function linkBase(req: Request): string {
  if (env.appUrl) return new URL(env.appUrl).origin;
  if (env.isProd) throw new HttpError(503, "reset_unconfigured", "Password reset isn't available right now. Please contact the administrator.");
  return new URL(req.url).origin;
}

export function assertResetAvailable() {
  if (!emailConfigured()) {
    throw new HttpError(503, "email_unconfigured", "Password reset by email isn't set up on this server yet. Please contact the administrator.");
  }
}

/** Issues a fresh single-use token (revoking earlier ones) and emails the link. Silent if the email is unknown. */
export async function issueReset(email: string, base: string): Promise<void> {
  const user = await queryOne<{ id: string; name: string; email: string }>("SELECT id, name, email FROM users WHERE lower(email) = $1", [email]);
  if (!user) return;
  await query("UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [user.id]);
  const token = randomToken(32);
  await query("INSERT INTO password_resets (id, user_id, expires_at) VALUES ($1, $2, now() + make_interval(mins => $3))", [
    sha256(token),
    user.id,
    RESET_TTL_MINUTES,
  ]);
  if (Math.random() < 0.05) void query("DELETE FROM password_resets WHERE expires_at < now() - interval '1 day'").catch(() => {});
  const link = `${base}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail(passwordResetEmail({ to: user.email, name: user.name, link, minutes: RESET_TTL_MINUTES }));
}

/** True when the token exists, is unused and unexpired. Does not consume it. */
export async function resetTokenValid(token: string): Promise<boolean> {
  if (!TOKEN_RE.test(token)) return false;
  const row = await queryOne("SELECT 1 FROM password_resets WHERE id = $1 AND used_at IS NULL AND expires_at > now()", [sha256(token)]);
  return row !== null;
}

/** Atomically consumes the token; returns the user id, or null if the link is invalid, used or expired. */
export async function consumeResetToken(token: string): Promise<string | null> {
  if (!TOKEN_RE.test(token)) return null;
  const row = await queryOne<{ user_id: string }>(
    "UPDATE password_resets SET used_at = now() WHERE id = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id",
    [sha256(token)],
  );
  return row?.user_id ?? null;
}

export async function notifyPasswordChanged(userId: string, base: string): Promise<void> {
  if (!emailConfigured()) return;
  const user = await queryOne<{ name: string; email: string }>("SELECT name, email FROM users WHERE id = $1", [userId]);
  if (!user) return;
  await sendEmail(passwordChangedEmail({ to: user.email, name: user.name, when: new Date(), resetUrl: `${base}/forgot-password` }));
}
