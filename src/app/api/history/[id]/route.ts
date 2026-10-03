import { requireUser } from "@/lib/auth/session";
import { HttpError, assertSameOrigin, json, parseJson } from "@/lib/http";
import { deleteRewrite, getRewrite, updateRewriteSegments } from "@/lib/history";
import { route } from "@/lib/route";
import { updateRewriteSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const item = await getRewrite(user.id, (await params).id);
  if (!item) throw new HttpError(404, "not_found", "That rewrite doesn't exist or was deleted.");
  return json(item);
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const body = await parseJson(req, updateRewriteSchema, 2_000_000);
  const ok = await updateRewriteSegments(user.id, (await params).id, body.segments);
  if (!ok) throw new HttpError(404, "not_found", "That rewrite doesn't exist or was deleted.");
  return json({ ok: true });
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const ok = await deleteRewrite(user.id, (await params).id);
  if (!ok) throw new HttpError(404, "not_found", "That rewrite doesn't exist or was already deleted.");
  return json({ ok: true });
});
