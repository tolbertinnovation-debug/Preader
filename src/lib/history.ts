import "server-only";
import type { RewriteSummary, SegmentResult } from "./ai/rewrite";
import { decrypt, encrypt } from "./crypto";
import { query, queryOne } from "./db";
import type { RewriteOptions } from "./options";

export type StoredSegment = SegmentResult & { accepted: "revised" | "original" | "edited"; edited?: string };
export type StoredResult = { segments: StoredSegment[]; summary: RewriteSummary };

export type HistoryItem = {
  id: string;
  title: string;
  mode: string;
  wordsIn: number;
  wordsOut: number;
  flagged: number;
  highRisk: number;
  createdAt: string;
  updatedAt: string;
};

export type HistoryDetail = HistoryItem & { original: string; options: RewriteOptions; result: StoredResult; model: string };

type Row = {
  id: string;
  title_enc: string;
  mode: string;
  words_in: number;
  words_out: number;
  flagged_count: number;
  high_risk_count: number;
  created_at: Date;
  updated_at: Date;
};

function safeDecrypt(v: string, fallback = "") {
  try {
    return decrypt(v);
  } catch {
    return fallback;
  }
}

function toItem(r: Row): HistoryItem {
  return {
    id: r.id,
    title: safeDecrypt(r.title_enc, "Untitled"),
    mode: r.mode,
    wordsIn: r.words_in,
    wordsOut: r.words_out,
    flagged: r.flagged_count,
    highRisk: r.high_risk_count,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export function deriveTitle(text: string, given?: string): string {
  if (given?.trim()) return given.trim().slice(0, 200);
  const first = text.trim().split("\n").find((l) => l.trim()) ?? "Untitled";
  const clean = first.replace(/^#+\s*/, "").trim();
  return clean.length > 80 ? `${clean.slice(0, 77).trimEnd()}…` : clean || "Untitled";
}

export async function saveRewrite(input: {
  userId: string;
  title: string;
  original: string;
  options: RewriteOptions;
  results: SegmentResult[];
  summary: RewriteSummary;
}): Promise<string> {
  const result: StoredResult = { segments: input.results.map((r) => ({ ...r, accepted: "revised" })), summary: input.summary };
  const row = await queryOne<{ id: string }>(
    `INSERT INTO rewrites (user_id, title_enc, original_enc, result_enc, mode, options, words_in, words_out, flagged_count, high_risk_count, model)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [
      input.userId,
      encrypt(input.title),
      encrypt(input.original),
      encrypt(JSON.stringify(result)),
      input.options.mode,
      JSON.stringify({ ...input.options, glossary: input.options.glossary.length }),
      input.summary.wordsIn,
      input.summary.wordsOut,
      input.summary.flagged,
      input.summary.highRisk,
      input.summary.model,
    ],
  );
  return row!.id;
}

export async function listRewrites(userId: string, opts: { limit: number; before?: string }): Promise<HistoryItem[]> {
  const rows = await query<Row>(
    `SELECT id, title_enc, mode, words_in, words_out, flagged_count, high_risk_count, created_at, updated_at
       FROM rewrites WHERE user_id = $1 AND ($2::timestamptz IS NULL OR created_at < $2)
      ORDER BY created_at DESC LIMIT $3`,
    [userId, opts.before ?? null, opts.limit],
  );
  return rows.map(toItem);
}

export async function getRewrite(userId: string, id: string): Promise<HistoryDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await queryOne<Row & { original_enc: string; result_enc: string; options: RewriteOptions; model: string }>(
    "SELECT * FROM rewrites WHERE id = $1 AND user_id = $2",
    [id, userId],
  );
  if (!r) return null;
  return {
    ...toItem(r),
    original: safeDecrypt(r.original_enc),
    options: r.options,
    model: r.model,
    result: JSON.parse(safeDecrypt(r.result_enc, '{"segments":[]}')) as StoredResult,
  };
}

export async function updateRewriteSegments(
  userId: string,
  id: string,
  segments: { id: string; accepted: StoredSegment["accepted"]; edited?: string }[],
): Promise<boolean> {
  const current = await getRewrite(userId, id);
  if (!current) return false;
  const byId = new Map(segments.map((s) => [s.id, s]));
  current.result.segments = current.result.segments.map((s) => {
    const u = byId.get(s.id);
    return u ? { ...s, accepted: u.accepted, edited: u.accepted === "edited" ? u.edited : undefined } : s;
  });
  await query("UPDATE rewrites SET result_enc = $1, updated_at = now() WHERE id = $2 AND user_id = $3", [
    encrypt(JSON.stringify(current.result)),
    id,
    userId,
  ]);
  return true;
}

export async function deleteRewrite(userId: string, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const rows = await query("DELETE FROM rewrites WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
  return rows.length > 0;
}

export function finalText(segments: StoredSegment[]): string {
  return segments
    .map((s) => (s.accepted === "original" ? s.original : s.accepted === "edited" ? (s.edited ?? s.revised) : s.revised))
    .map((t) => t.trim())
    .filter(Boolean)
    .join("\n\n");
}
