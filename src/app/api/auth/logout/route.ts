import { destroySession } from "@/lib/auth/session";
import { assertSameOrigin, json } from "@/lib/http";
import { route } from "@/lib/route";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  await destroySession();
  return json({ ok: true });
});
