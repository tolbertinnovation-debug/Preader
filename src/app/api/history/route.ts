import { requireUser } from "@/lib/auth/session";
import { json } from "@/lib/http";
import { listRewrites } from "@/lib/history";
import { route } from "@/lib/route";

export const GET = route(async (req) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const before = url.searchParams.get("before");
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20));
  const items = await listRewrites(user.id, { limit, before: before && !Number.isNaN(Date.parse(before)) ? before : undefined });
  return json({ items, nextBefore: items.length === limit ? items.at(-1)!.createdAt : null });
});
