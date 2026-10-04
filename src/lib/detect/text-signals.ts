// Writing-pattern signals. These are shown as supporting context only: they never
// produce a score or a verdict, because formal human writing (including much West
// African and Liberian academic English) uses the same phrases and structures.
import { findCliches } from "@/lib/text/cliches";
import { analyze, splitSentences } from "@/lib/text/readability";
import type { Evidence, Highlight } from "./types";

/** Text a chatbot leaves behind when its reply is pasted without editing. */
const ARTIFACTS: { re: RegExp; note: string }[] = [
  { re: /\bas an ai(?: language)? model\b/giu, note: "Chatbot self-reference" },
  { re: /\bas of my (?:last )?(?:knowledge )?(?:update|cutoff)\b/giu, note: "Chatbot knowledge-cutoff phrase" },
  { re: /\bmy knowledge cutoff\b/giu, note: "Chatbot knowledge-cutoff phrase" },
  { re: /\bI (?:can(?:no|')t|am unable to) (?:browse the internet|access real-time)\b/giu, note: "Chatbot limitation notice" },
  { re: /(?:^|\n)\s*(?:Certainly|Sure|Absolutely|Of course)[!,.] (?:Here(?:'s| is| are)|Below is)\b/giu, note: "Chatbot reply opener" },
  { re: /\bI hope this (?:helps|essay helps|gives you)\b/giu, note: "Chatbot sign-off" },
  { re: /\b(?:Let me know|Feel free to ask) if you(?:'d like| would like| need| want) (?:me to|any|more)\b/giu, note: "Chatbot follow-up offer" },
  { re: /\[(?:Your Name|Your Organi[sz]ation|Insert [^\]\n]{1,40}|Company Name|Recipient(?:'s)? Name|Date)\]/giu, note: "Unfilled template placeholder" },
  { re: /\bRegenerate response\b/gu, note: "Copied chatbot interface text" },
];

/** Zero-width, bidi-control and other invisible characters sometimes used to fool detectors. */
const HIDDEN = /[­᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/gu;
/** A Cyrillic or Greek letter inside an otherwise Latin word (homoglyph substitution). */
const HOMOGLYPH = /(?<=\p{Script=Latin})[\p{Script=Cyrillic}\p{Script=Greek}]|[\p{Script=Cyrillic}\p{Script=Greek}](?=\p{Script=Latin})/gu;

export type PatternReport = { evidence: Evidence[]; highlights: Highlight[] };

export function textPatterns(text: string): PatternReport {
  const evidence: Evidence[] = [];
  const highlights: Highlight[] = [];
  const stats = analyze(text);

  const artifactHits: string[] = [];
  for (const { re, note } of ARTIFACTS) {
    for (const m of text.matchAll(re)) {
      const lead = m[0].length - m[0].trimStart().length;
      highlights.push({ start: m.index! + lead, end: m.index! + m[0].length, kind: "artifact", ai: null, note });
      artifactHits.push(note);
    }
  }
  if (artifactHits.length) {
    evidence.push({
      id: "artifacts",
      source: "Writing patterns",
      direction: "ai",
      strength: "moderate",
      title: "Leftover chatbot wording",
      detail: `Found ${artifactHits.length} phrase${artifactHits.length === 1 ? "" : "s"} that chatbots typically add to replies (${[...new Set(artifactHits)].join(", ").toLowerCase()}). This suggests some text was pasted from a chatbot, unless the writing is quoting or discussing one.`,
    });
  }

  // A zero-width joiner inside an emoji sequence (e.g. 👩‍💻) is legitimate.
  const hidden = [...text.matchAll(HIDDEN)].filter(
    (m) => !(m[0] === "‍" && /[\p{Extended_Pictographic}️\u{1F3FB}-\u{1F3FF}]$/u.test(text.slice(Math.max(0, m.index! - 2), m.index!))),
  );
  const homoglyphs = [...text.matchAll(HOMOGLYPH)];
  for (const m of hidden) highlights.push({ start: m.index!, end: m.index! + m[0].length, kind: "hidden", ai: null, note: `Invisible character U+${m[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}` });
  for (const m of homoglyphs) highlights.push({ start: m.index!, end: m.index! + m[0].length, kind: "hidden", ai: null, note: "Look-alike letter from another alphabet" });
  if (hidden.length || homoglyphs.length) {
    const parts = [];
    if (hidden.length) parts.push(`${hidden.length} invisible character${hidden.length === 1 ? "" : "s"}`);
    if (homoglyphs.length) parts.push(`${homoglyphs.length} look-alike letter${homoglyphs.length === 1 ? "" : "s"} from another alphabet`);
    evidence.push({
      id: "hidden",
      source: "Writing patterns",
      direction: "warning",
      strength: "moderate",
      title: "Hidden or disguised characters",
      detail: `The text contains ${parts.join(" and ")}. These can come from copying between apps, but they are also used to trick AI detectors. They are not evidence of AI on their own.`,
    });
  }

  const phrases = findCliches(text);
  for (const p of phrases) highlights.push({ start: p.index, end: p.index + p.length, kind: "phrase", ai: null, note: "Stock phrase" });
  const per100 = stats.words ? (phrases.length * 100) / stats.words : 0;
  if (stats.words >= 60 && per100 >= 1.5) {
    evidence.push({
      id: "phrases",
      source: "Writing patterns",
      direction: "ai",
      strength: "weak",
      title: "Frequent stock phrases",
      detail: `${phrases.length} stock phrases (${per100.toFixed(1)} per 100 words), such as “${[...new Set(phrases.map((p) => p.phrase))].slice(0, 3).join("”, “")}”. AI writing often leans on these, but so does formal human writing, especially academic and West African English. This is not used to decide the result.`,
    });
  }

  const sentences = splitSentences(text);
  const cv = stats.avgSentenceLength ? stats.rhythmVariety / stats.avgSentenceLength : 0;
  if (sentences.length >= 8 && cv > 0 && cv < 0.28) {
    evidence.push({
      id: "rhythm",
      source: "Writing patterns",
      direction: "ai",
      strength: "weak",
      title: "Very even sentence lengths",
      detail: `Sentences are similar in length (average ${stats.avgSentenceLength} words, variation ${stats.rhythmVariety}). Unedited AI text is often this even, but careful human writers can be too. This is not used to decide the result.`,
    });
  }
  if (stats.repeatedOpeners >= 3) {
    evidence.push({
      id: "openers",
      source: "Writing patterns",
      direction: "neutral",
      strength: "info",
      title: "Repeated sentence openings",
      detail: `Several sentences start with the same word. This is common in both rushed human writing and AI text, so it doesn't point either way.`,
    });
  }
  return { evidence, highlights };
}

/**
 * Locates provider-reported sentences in the original text, tolerating whitespace
 * differences. Returns spans in original-text offsets, in order.
 */
export function locateSentences(text: string, sentences: string[]): ({ start: number; end: number } | null)[] {
  // Build a whitespace-collapsed copy with a map back to original offsets.
  const map: number[] = [];
  let norm = "";
  let prevSpace = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      if (!prevSpace) {
        norm += " ";
        map.push(i);
      }
      prevSpace = true;
    } else {
      norm += ch;
      map.push(i);
      prevSpace = false;
    }
  }
  let cursor = 0;
  return sentences.map((s) => {
    const needle = s.replace(/\s+/g, " ").trim();
    if (!needle) return null;
    let at = norm.indexOf(needle, cursor);
    if (at < 0) at = norm.indexOf(needle);
    if (at < 0) return null;
    cursor = at + needle.length;
    return { start: map[at]!, end: map[at + needle.length - 1]! + 1 };
  });
}
