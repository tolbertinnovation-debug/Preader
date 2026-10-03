import { findCliches, repeatedOpeners } from "./cliches";
import { words as tokenize } from "./words";

export type ReadabilityStats = {
  words: number;
  sentences: number;
  avgSentenceLength: number;
  /** Standard deviation of sentence length — higher means more natural rhythm. */
  rhythmVariety: number;
  /** Flesch Reading Ease (0–100, higher is easier). */
  readingEase: number;
  /** Approximate US grade level (Flesch–Kincaid). */
  gradeLevel: number;
  /** Moving-average type–token ratio (0–1). */
  lexicalVariety: number;
  roboticPhrases: number;
  repeatedOpeners: number;
};

export function splitSentences(text: string): string[] {
  return text
    .replace(/\b(?:e\.g|i\.e|et al|etc|vs|cf|Dr|Mr|Mrs|Ms|Prof|No|Fig|pp?|vol)\./gi, (m) => m.replace(/\./g, "∯"))
    .split(/(?<=[.!?])["”’)]?\s+(?=[\p{Lu}\p{N}"“(])|\n+/u)
    .map((s) => s.replace(/∯/g, ".").trim())
    .filter((s) => /\p{L}/u.test(s));
}

export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 1;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

function mattr(tokens: string[], window = 50): number {
  if (tokens.length === 0) return 0;
  if (tokens.length <= window) return new Set(tokens).size / tokens.length;
  let total = 0;
  let n = 0;
  for (let i = 0; i + window <= tokens.length; i += 5) {
    total += new Set(tokens.slice(i, i + window)).size / window;
    n++;
  }
  return total / n;
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export function analyze(text: string): ReadabilityStats {
  const sentences = splitSentences(text);
  const tokens = tokenize(text);
  const lengths = sentences.map((s) => tokenize(s).length).filter((n) => n > 0);
  const wc = tokens.length;
  const sc = Math.max(1, lengths.length);
  const avg = wc / sc;
  const variance = lengths.length ? lengths.reduce((acc, l) => acc + (l - avg) ** 2, 0) / lengths.length : 0;
  const syl = tokens.reduce((acc, w) => acc + syllables(w), 0);
  const spw = wc ? syl / wc : 0;
  return {
    words: wc,
    sentences: lengths.length,
    avgSentenceLength: round(avg),
    rhythmVariety: round(Math.sqrt(variance)),
    readingEase: wc ? round(Math.min(100, Math.max(0, 206.835 - 1.015 * avg - 84.6 * spw))) : 0,
    gradeLevel: wc ? round(Math.max(0, 0.39 * avg + 11.8 * spw - 15.59)) : 0,
    lexicalVariety: round(mattr(tokens.map((t) => t.toLowerCase())), 2),
    roboticPhrases: findCliches(text).length,
    repeatedOpeners: repeatedOpeners(sentences),
  };
}
