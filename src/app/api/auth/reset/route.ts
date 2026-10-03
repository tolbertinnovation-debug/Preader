import { after } from "next/server";
import { consumeResetToken, linkBase, notifyPasswordChanged } from "@/lib/auth/reset";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { HttpError, assertSameOrigin, clientIp, json, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { route } from "@/lib/route";
import { passwordSchema } from "@/lib/validation";
import { z } from "zod";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  await rateLimit(`reset-ip:${clientIp(req)}`, 20, 3600, "Too many attempts. Please try again later.");
  const body = await parseJson(req, z.object({ token: z.string().max(200), password: passwordSchema }), 5_000);
  // Hash first so the token is consumed only once we're ready to write.
  const hash = await hashPassword(body.password);
  const userId = await consumeResetToken(body.token);
  if (!userId) {
    throw new HttpError(400, "invalid_token", "This reset link is invalid, has expired or has already been used. Request a new one.");
  }
  await query("UPDATE users SET password_hash = $1, failed_logins = 0, locked_until = NULL, updated_at = now() WHERE id = $2", [hash, userId]);
  // Revoke every other way in: existing sessions and any other outstanding reset links.
  await query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  await query("UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [userId]);
  await createSession(userId);
  try {
    const base = linkBase(req);
    after(() => notifyPasswordChanged(userId, base).catch(() => {}));
  } catch {
    /* no public URL configured: skip the courtesy email, the reset itself succeeded */
  }
  return json({ ok: true });
});
