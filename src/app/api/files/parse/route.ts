import { requireUser } from "@/lib/auth/session";
import { parseUpload } from "@/lib/files/parse";
import { HttpError, assertSameOrigin, json } from "@/lib/http";
import { LIMITS } from "@/lib/options";
import { rateLimit } from "@/lib/rate-limit";
import { route } from "@/lib/route";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await rateLimit(`upload:${user.id}`, 20, 60);
  if (Number(req.headers.get("content-length") ?? 0) > LIMITS.maxUploadBytes + 64_000) {
    throw new HttpError(413, "too_large", "Files must be 5 MB or smaller.");
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "bad_upload", "We couldn't read that upload.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "no_file", "Choose a file to upload.");
  if (file.size > LIMITS.maxUploadBytes) throw new HttpError(413, "too_large", "Files must be 5 MB or smaller.");
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    return json(await parseUpload(file.name, buf));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(422, "parse_failed", "We couldn't read that file. Try saving it again or uploading a different format.");
  }
});
