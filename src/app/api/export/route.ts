import { requireUser } from "@/lib/auth/session";
import { documentDocx, reportDocx } from "@/lib/files/export";
import { HttpError, assertSameOrigin, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { route } from "@/lib/route";
import { exportSchema } from "@/lib/validation";

export const runtime = "nodejs";

function filename(title: string, suffix: string) {
  const base = title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "-").slice(0, 60) || "panpen";
  return `${base}${suffix}.docx`;
}

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await rateLimit(`export:${user.id}`, 30, 60);
  const body = await parseJson(req, exportSchema, 3_000_000);
  let buf: Buffer;
  let name: string;
  if (body.format === "report") {
    if (!body.segments?.length) throw new HttpError(400, "no_segments", "Nothing to include in the report yet.");
    buf = await reportDocx(body.title, body.segments);
    name = filename(body.title, "-revision-report");
  } else {
    buf = await documentDocx(body.title, body.text);
    name = filename(body.title, "");
  }
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
});
