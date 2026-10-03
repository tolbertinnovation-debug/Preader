import { after } from "next/server";
import { assertResetAvailable, issueReset, linkBase } from "@/lib/auth/reset";
import { assertSameOrigin, clientIp, json, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { route } from "@/lib/route";
import { emailSchema } from "@/lib/validation";
import { z } from "zod";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  assertResetAvailable();
  const base = linkBase(req);
  const { email } = await parseJson(req, z.object({ email: emailSchema }), 5_000);
  await rateLimit(`forgot-ip:${clientIp(req)}`, 10, 3600, "Too many reset requests from this network. Please try again later.");
  await rateLimit(`forgot-email:${email}`, 3, 3600, "We've already sent several reset emails to this address. Please check your inbox (and spam folder) or try again in an hour.");
  // All lookups and sending happen after the response, so timing never reveals whether an account exists.
  after(async () => {
    try {
      await issueReset(email, base);
    } catch (err) {
      console.error("[preader] password reset email failed:", err instanceof Error ? err.message : "unknown");
    }
  });
  return json({ ok: true });
});
