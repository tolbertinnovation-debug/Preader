/**
 * Replaces content that must survive verbatim (citations, quotations, links,
 * statistics, personal details) with opaque placeholders before text is sent to
 * the model, and restores it afterwards. The model never sees — and so can never
 * alter or "improve" — a citation, a quotation or a statistic.
 */

export type TokenKind = "CITE" | "QUOTE" | "URL" | "STAT" | "PII";

type Rule = { kind: TokenKind; re: RegExp; minWords?: number };

const YEAR = String.raw`(?:1[5-9]\d{2}|20\d{2})[a-z]?|n\.d\.|in press|forthcoming`;

const RULES: Rule[] = [
  { kind: "URL", re: /\bhttps?:\/\/[^\s<>"')\]]+[^\s<>"'.,;:)\]]/g },
  { kind: "URL", re: /\bwww\.[^\s<>"')\]]+[^\s<>"'.,;:)\]]/g },
  { kind: "URL", re: /\b(?:doi:\s*)?10\.\d{4,9}\/[^\s"<>]+[^\s"<>.,;:)]/gi },
  { kind: "PII", re: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g },
  // Parenthetical author–date citations: (Mensah, 2019), (Adeyemi et al., 2021; Okafor & Bello, 2018, p. 4)
  {
    kind: "CITE",
    re: new RegExp(String.raw`\((?:[^()]*?(?:${YEAR})[^()]*?)\)`, "g"),
  },
  // Numeric citations: [1], [2, 5], [3–7]
  { kind: "CITE", re: /\[\d+(?:\s*[,–\-]\s*\d+)*\]/g },
  // Direct quotations of three or more words, straight or curly quotes
  { kind: "QUOTE", re: /“[^”\n]{3,}?”|"[^"\n]{3,}?"/g, minWords: 3 },
  // Statistics: p-values, test statistics, sample sizes, confidence intervals
  {
    kind: "STAT",
    re: /\b(?:p|r|t|F|N|n|M|SD|SE|β|R²|R2|df|OR|RR|HR|χ²|z)\s*(?:\(\s*\d+(?:,\s*\d+)?\s*\))?\s*[=<>≤≥]\s*-?\d*\.?\d+(?:\s*[,–-]\s*\d*\.?\d+)?/g,
  },
  { kind: "STAT", re: /\b\d{1,3}(?:\.\d+)?%\s*CI\s*[[(][^\])]{1,40}[\])]/g },
  // Percentages and currency amounts
  { kind: "STAT", re: /(?:[$€£₦₵]|GH₵|L\$|US\$|KSh|(?<![A-Za-z])R(?=\s?\d)|USD\s?|LRD\s?)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|billion|bn|m|k))?/g },
  { kind: "STAT", re: /-?\b\d[\d,]*(?:\.\d+)?\s?(?:%|per\s?cent\b|percent\b)/g },
];

const PII_RULES: Rule[] = [
  // Phone numbers in international or common local formats (7+ digits)
  { kind: "PII", re: /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}\b/g },
];

export type ProtectResult = { masked: string; tokens: Record<string, string> };

export type Counter = { n: number };

export function protect(text: string, opts: { maskPersonal: boolean }, counter: Counter = { n: 0 }): ProtectResult {
  const rules = opts.maskPersonal ? [...RULES, ...PII_RULES] : RULES;
  const spans: { start: number; end: number; kind: TokenKind }[] = [];
  for (const rule of rules) {
    rule.re.lastIndex = 0;
    for (const m of text.matchAll(rule.re)) {
      const value = m[0];
      if (rule.minWords && value.split(/\s+/).length < rule.minWords) continue;
      if (rule.kind === "PII" && rule.re === PII_RULES[0]!.re && value.replace(/\D/g, "").length < 7) continue;
      spans.push({ start: m.index!, end: m.index! + value.length, kind: rule.kind });
    }
  }
  // Resolve overlaps: earliest start wins; for equal starts the longest span wins.
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const chosen: typeof spans = [];
  let lastEnd = -1;
  for (const s of spans) {
    if (s.start >= lastEnd) {
      chosen.push(s);
      lastEnd = s.end;
    }
  }
  const tokens: Record<string, string> = {};
  let masked = "";
  let cursor = 0;
  for (const s of chosen) {
    counter.n += 1;
    const key = `${s.kind}${counter.n}`;
    tokens[key] = text.slice(s.start, s.end);
    masked += text.slice(cursor, s.start) + `⟦${key}⟧`;
    cursor = s.end;
  }
  masked += text.slice(cursor);
  return { masked, tokens };
}

// Accept the canonical form plus common model mangling: [[CITE1]], ⟦ CITE1 ⟧, 【CITE1】
const TOKEN_RE = /(?:⟦|\[\[|【)\s*(CITE|QUOTE|URL|STAT|PII)(\d+)\s*(?:⟧|\]\]|】)/g;

export type RestoreResult = { text: string; missing: string[]; duplicated: string[]; unknown: string[] };

export function restore(masked: string, tokens: Record<string, string>): RestoreResult {
  const seen = new Map<string, number>();
  const unknown: string[] = [];
  // Tidy spacing in the model's own text first, so protected values are restored byte-for-byte.
  const tidy = masked.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([,.;:])/g, "$1");
  const text = tidy.replace(TOKEN_RE, (_whole, kind: string, num: string) => {
    const key = `${kind}${num}`;
    const value = tokens[key];
    if (value === undefined) {
      unknown.push(key);
      return "";
    }
    seen.set(key, (seen.get(key) ?? 0) + 1);
    return value;
  });
  const missing = Object.keys(tokens).filter((k) => !seen.has(k));
  const duplicated = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  return { text, missing, duplicated, unknown };
}

export function tokenKeys(masked: string): string[] {
  return [...masked.matchAll(TOKEN_RE)].map((m) => `${m[1]}${m[2]}`);
}

export function describeToken(key: string): string {
  if (key.startsWith("CITE")) return "citation";
  if (key.startsWith("QUOTE")) return "quotation";
  if (key.startsWith("URL")) return "link/DOI";
  if (key.startsWith("STAT")) return "statistic";
  return "personal detail";
}
