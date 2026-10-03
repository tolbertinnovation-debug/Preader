import { requireUser } from "@/lib/auth/session";
import { decrypt } from "@/lib/crypto";
import { query, queryOne } from "@/lib/db";
import { getRewrite } from "@/lib/history";
import { rateLimit } from "@/lib/rate-limit";
import { route } from "@/lib/route";

/** Data portability: everything Preader stores about the user, decrypted, as JSON. */
export const GET = route(async () => {
  const user = await requireUser();
  await rateLimit(`data-export:${user.id}`, 5, 3600);
  const voice = await queryOne<{ voice_sample_enc: string | null }>("SELECT voice_sample_enc FROM users WHERE id = $1", [user.id]);
  const ids = await query<{ id: string }>("SELECT id FROM rewrites WHERE user_id = $1 ORDER BY created_at DESC", [user.id]);
  const rewrites = [];
  for (const { id } of ids) rewrites.push(await getRewrite(user.id, id));
  const usage = await query("SELECT kind, words, created_at FROM usage_events WHERE user_id = $1 ORDER BY created_at DESC", [user.id]);
  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      account: { email: user.email, name: user.name, createdAt: user.createdAt, preferences: user.preferences },
      voiceSample: voice?.voice_sample_enc ? decrypt(voice.voice_sample_enc) : null,
      rewrites,
      usage,
    },
    null,
    2,
  );
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="preader-data-export.json"',
      "Cache-Control": "no-store",
    },
  });
});
