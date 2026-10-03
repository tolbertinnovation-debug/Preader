import { queryOne } from "@/lib/db";
import { json } from "@/lib/http";

export async function GET() {
  try {
    await queryOne("SELECT 1");
    return json({ ok: true });
  } catch {
    return json({ ok: false }, { status: 503 });
  }
}
