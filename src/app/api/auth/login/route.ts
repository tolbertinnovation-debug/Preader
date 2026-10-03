import { createSession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { query, queryOne } from "@/lib/db";
import { HttpError, assertSameOrigin, clientIp, json, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { route } from "@/lib/route";
import { loginSchema } from "@/lib/validation";

const INVALID = "That email and password don't match our records.";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const body = await parseJson(req, loginSchema, 10_000);
  await rateLimit(`login-ip:${clientIp(req)}`, 30, 900, "Too many sign-in attempts. Please wait a few minutes.");
  await rateLimit(`login-email:${body.email}`, 10, 900, "Too many sign-in attempts for this account. Please wait 15 minutes.");

  const user = await queryOne<{ id: string; password_hash: string; locked_until: Date | null; failed_logins: number }>(
    "SELECT id, password_hash, locked_until, failed_logins FROM users WHERE lower(email) = $1",
    [body.email],
  );
  if (user?.locked_until && user.locked_until > new Date()) {
    throw new HttpError(423, "locked", "This account is temporarily locked after repeated failed sign-ins. Try again in 15 minutes.");
  }
  const ok = await verifyPassword(body.password, user?.password_hash);
  if (!user || !ok) {
    if (user) {
      await query(
        `UPDATE users SET failed_logins = failed_logins + 1,
           locked_until = CASE WHEN failed_logins + 1 >= 8 THEN now() + interval '15 minutes' ELSE locked_until END
         WHERE id = $1`,
        [user.id],
      );
    }
    throw new HttpError(401, "invalid_credentials", INVALID);
  }
  if (user.failed_logins > 0) await query("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1", [user.id]);
  await createSession(user.id);
  return json({ ok: true });
});
