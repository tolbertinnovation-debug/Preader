import { after } from "next/server";
import { linkBase, notifyPasswordChanged } from "@/lib/auth/reset";
import { createSession, requireUser } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { query, queryOne } from "@/lib/db";
import { HttpError, assertSameOrigin, json, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { route } from "@/lib/route";
import { passwordChangeSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await rateLimit(`password:${user.id}`, 5, 900);
  const body = await parseJson(req, passwordChangeSchema, 5_000);
  const row = await queryOne<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [user.id]);
  if (!(await verifyPassword(body.currentPassword, row?.password_hash))) {
    throw new HttpError(401, "wrong_password", "Your current password is incorrect.");
  }
  await query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [await hashPassword(body.newPassword), user.id]);
  // Sign out every other device, then issue a fresh session here.
  await query("DELETE FROM sessions WHERE user_id = $1", [user.id]);
  await query("UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [user.id]);
  await createSession(user.id);
  try {
    const base = linkBase(req);
    after(() => notifyPasswordChanged(user.id, base).catch(() => {}));
  } catch {
    /* no public URL configured: skip the courtesy email */
  }
  return json({ ok: true });
});
