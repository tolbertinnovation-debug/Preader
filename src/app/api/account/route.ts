import { destroySession, requireUser } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { encrypt } from "@/lib/crypto";
import { query, queryOne } from "@/lib/db";
import { HttpError, assertSameOrigin, json, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { route } from "@/lib/route";
import { cleanPinned } from "@/lib/text/voice";
import { settingsSchema } from "@/lib/validation";
import { z } from "zod";

export const PATCH = route(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const body = await parseJson(req, settingsSchema, 50_000);
  if (body.name !== undefined) await query("UPDATE users SET name = $1, updated_at = now() WHERE id = $2", [body.name, user.id]);
  if (body.preferences !== undefined) {
    await query("UPDATE users SET preferences = $1, updated_at = now() WHERE id = $2", [JSON.stringify(body.preferences), user.id]);
  }
  if (body.voiceSample !== undefined) {
    const v = body.voiceSample?.trim();
    await query("UPDATE users SET voice_sample_enc = $1, updated_at = now() WHERE id = $2", [v ? encrypt(v) : null, user.id]);
  }
  if (body.voicePhrases !== undefined) {
    const phrases = cleanPinned(body.voicePhrases);
    await query("UPDATE users SET voice_phrases_enc = $1, updated_at = now() WHERE id = $2", [phrases.length ? encrypt(JSON.stringify(phrases)) : null, user.id]);
  }
  return json({ ok: true });
});

export const DELETE = route(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await rateLimit(`delete-account:${user.id}`, 5, 900);
  const { password } = await parseJson(req, z.object({ password: z.string().min(1).max(200) }), 5_000);
  const row = await queryOne<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [user.id]);
  if (!(await verifyPassword(password, row?.password_hash))) throw new HttpError(401, "wrong_password", "That password is incorrect.");
  await destroySession();
  // Cascades to sessions, rewrites and usage records.
  await query("DELETE FROM users WHERE id = $1", [user.id]);
  return json({ ok: true });
});
