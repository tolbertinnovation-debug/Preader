export type SegmentKind = "text" | "heading" | "preserved";
export type Segment = { id: string; kind: SegmentKind; text: string };

const REFERENCE_HEADING =
  /^(?:#{1,6}\s*)?(?:\d+(?:\.\d+)*\.?\s+)?(references?|bibliography|works cited|reference list|literature cited|sources|citations|endnotes|notes)\s*:?\s*$/i;
const MD_HEADING = /^#{1,6}\s+\S/;
const NUMBERED_HEADING = /^(?:\d+(?:\.\d+)*\.?|[IVXLC]+\.|[A-Z]\.)\s+\p{Lu}[^.!?]*$/u;
const LIST_LINE = /^\s*(?:[-*•▪◦]|\d+[.)]|[a-z][.)])\s+/;

export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[​-‍﻿]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isHeading(block: string): boolean {
  if (block.includes("\n")) return false;
  if (MD_HEADING.test(block)) return true;
  const wc = block.split(/\s+/).length;
  if (wc > 14 || block.length > 120) return false;
  if (/[.!?;,:]$/.test(block) && !/:$/.test(block)) return false;
  if (NUMBERED_HEADING.test(block)) return true;
  // Short line without terminal punctuation that starts with a capital: a title or section heading.
  return /^\p{Lu}/u.test(block) && !/[.!?]$/.test(block) && wc <= 12;
}

function looksStructured(block: string): boolean {
  const lines = block.split("\n");
  if (block.startsWith("```")) return true;
  // Tables (markdown pipes or tab-separated columns)
  if (lines.length >= 2 && lines.filter((l) => /\|.*\|/.test(l) || l.split("\t").length >= 3).length >= lines.length * 0.6) return true;
  // Blocks that are mostly URLs/DOIs or equations
  const stripped = block.replace(/https?:\/\/\S+|\b10\.\d{4,9}\/\S+/g, "").trim();
  if (stripped.length < block.length * 0.3) return true;
  const letters = (block.match(/\p{L}/gu) ?? []).length;
  return block.length > 8 && letters / block.length < 0.35;
}

/**
 * Splits a document into paragraph-level segments. Headings, tables, code and
 * everything from a References/Bibliography heading onward are preserved verbatim.
 */
export function segmentDocument(raw: string): Segment[] {
  const text = normalizeText(raw);
  if (!text) return [];
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out: Segment[] = [];
  let inReferences = false;
  blocks.forEach((block, i) => {
    const id = `s${i + 1}`;
    if (REFERENCE_HEADING.test(block.split("\n")[0]!.trim())) inReferences = true;
    if (inReferences || looksStructured(block)) {
      out.push({ id, kind: "preserved", text: block });
    } else if (isHeading(block)) {
      out.push({ id, kind: "heading", text: block });
    } else {
      out.push({ id, kind: "text", text: block });
    }
  });
  return out;
}

export function joinSegments(parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join("\n\n");
}

export function isListBlock(block: string): boolean {
  const lines = block.split("\n");
  return lines.length > 1 && lines.filter((l) => LIST_LINE.test(l)).length >= Math.ceil(lines.length / 2);
}

/** Groups segments into batches of roughly `maxWords` words for one model call. */
export function batchSegments<T extends { text: string }>(segments: T[], maxWords: number, count: (s: string) => number): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let words = 0;
  for (const seg of segments) {
    const w = count(seg.text);
    if (current.length && words + w > maxWords) {
      batches.push(current);
      current = [];
      words = 0;
    }
    current.push(seg);
    words += w;
  }
  if (current.length) batches.push(current);
  return batches;
}
