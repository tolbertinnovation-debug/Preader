import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { detectionReportDocx } from "@/lib/detect/report";
import { verifySeal } from "@/lib/detect/run";
import type { DetectResult } from "@/lib/detect/types";
import { HttpError, assertSameOrigin, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { route } from "@/lib/route";

export const runtime = "nodejs";

const Body = z.object({
  result: z.object({ kind: z.enum(["text", "image"]), id: z.string().max(40) }).passthrough(),
  seal: z.string().min(10).max(100),
});

/** Builds a Word report from a result PanPen produced. The seal stops edited results being turned into reports. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await rateLimit(`detect-report:${user.id}`, 20, 60);
  const body = await parseJson(req, Body, 2_000_000);
  if (!verifySeal(body)) {
    throw new HttpError(400, "invalid_seal", "This result can't be verified (it may have been changed). Please run the check again.");
  }
  const result = body.result as unknown as DetectResult;
  const docx = await detectionReportDocx(result);
  return new Response(new Uint8Array(docx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="panpen-detection-report-${result.id.replace(/[^A-Za-z0-9-]/g, "")}.docx"`,
      "Cache-Control": "no-store",
    },
  });
});
