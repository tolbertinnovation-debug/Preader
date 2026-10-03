import { createSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { queryOne } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError, assertSameOrigin, clientIp, json, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { route } from "@/lib/route";
import { signupSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  if (!env.allowSignups) throw new HttpError(403, "signups_closed", "New sign-ups are currently closed.");
  await rateLimit(`signup:${clientIp(req)}`, 5, 3600, "Too many accounts created from this network. Please try again later.");
  const body = await parseJson(req, signupSchema, 10_000);
  const hash = await hashPassword(body.password);
  const user = await queryOne<{ id: string }>(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT ((lower(email))) DO NOTHING RETURNING id`,
    [body.email, body.name, hash],
  );
  if (!user) throw new HttpError(409, "email_taken", "An account with this email already exists. Try signing in.");
  await createSession(user.id);
  return json({ ok: true }, { status: 201 });
});
