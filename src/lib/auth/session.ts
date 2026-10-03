import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { query, queryOne } from "../db";
import { randomToken, sha256 } from "../crypto";
import { env } from "../env";
import { HttpError } from "../http";
import type { Preferences } from "../validation";

export const SESSION_COOKIE = env.isProd ? "__Host-preader_session" : "preader_session";
const SESSION_DAYS = 30;
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  preferences: Preferences;
  hasVoiceSample: boolean;
  createdAt: string;
};

export async function createSession(userId: string) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await query("INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES ($1, $2, $3, $4)", [
    sha256(token),
    userId,
    expires,
    ua,
  ]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    expires,
  });
  if (Math.random() < 0.05) void query("DELETE FROM sessions WHERE expires_at < now()").catch(() => {});
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query("DELETE FROM sessions WHERE id = $1", [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const id = sha256(token);
  const row = await queryOne<{
    id: string;
    email: string;
    name: string;
    preferences: Preferences;
    has_voice: boolean;
    created_at: Date;
    last_seen_at: Date;
  }>(
    `SELECT u.id, u.email, u.name, u.preferences, (u.voice_sample_enc IS NOT NULL) AS has_voice, u.created_at, s.last_seen_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now()`,
    [id],
  );
  if (!row) return null;
  if (Date.now() - row.last_seen_at.getTime() > REFRESH_AFTER_MS) {
    // Sliding expiry, refreshed at most daily.
    void query("UPDATE sessions SET last_seen_at = now(), expires_at = now() + interval '30 days' WHERE id = $1", [id]).catch(
      () => {},
    );
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    preferences: row.preferences ?? {},
    hasVoiceSample: row.has_voice,
    createdAt: row.created_at.toISOString(),
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "unauthenticated", "Please sign in to continue.");
  return user;
}
