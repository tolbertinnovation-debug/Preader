import "server-only";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { env } from "./env";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

export function json<T>(data: T, init: ResponseInit = {}) {
  return NextResponse.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init.headers ?? {}) },
  });
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return json({ error: { code: err.code, message: err.message } }, { status: err.status, headers: err.headers });
  }
  // Never echo internals (or user text) back to the client or into logs.
  console.error("[preader] unhandled error:", err instanceof Error ? `${err.name}: ${err.message}` : "unknown");
  return json({ error: { code: "internal", message: "Something went wrong on our side. Please try again." } }, { status: 500 });
}

/** CSRF defence for state-changing requests: require a same-origin Origin (or Referer) header. */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin") ?? refererOrigin(req.headers.get("referer"));
  const allowed = new Set<string>();
  if (env.appUrl) allowed.add(new URL(env.appUrl).origin);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? (env.isProd ? "https" : "http");
    allowed.add(`${proto}://${host}`);
  }
  if (!origin || !allowed.has(origin)) {
    throw new HttpError(403, "bad_origin", "This request did not come from Preader.");
  }
}

function refererOrigin(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export async function parseJson<T>(req: Request, schema: ZodType<T>, maxBytes = 1_000_000): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new HttpError(413, "too_large", "That request is too large.");
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    throw new HttpError(400, "bad_request", "Could not read the request.");
  }
  if (raw.length > maxBytes) throw new HttpError(413, "too_large", "That request is too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "bad_json", "The request body was not valid JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(400, "invalid", first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input.");
  }
  return parsed.data;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
