import { describeToken, type RestoreResult } from "./protect";
import { countWords } from "./words";

export type RiskLevel = "none" | "low" | "medium" | "high";
export type Flag = { level: Exclude<RiskLevel, "none">; code: string; message: string };

const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17",
  eighteen: "18", nineteen: "19", twenty: "20", thirty: "30", forty: "40", fifty: "50", hundred: "100",
  first: "1", second: "2", third: "3", fourth: "4", fifth: "5", half: "0.5", twice: "2", double: "2",
};

/** Multiset of numeric values (digits and common number words), normalised. */
export function numbersIn(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const add = (v: string) => out.set(v, (out.get(v) ?? 0) + 1);
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    let v = m[0].replace(/,(?=\d{3}\b)/g, "").replace(/,$/, "");
    if (v.includes(".")) v = String(Number(v));
    add(v);
  }
  for (const m of text.toLowerCase().matchAll(/\b[a-z]+\b/g)) {
    const v = NUMBER_WORDS[m[0]];
    if (v) add(v);
  }
  return out;
}

function multisetDiff(a: Map<string, number>, b: Map<string, number>): string[] {
  const out: string[] = [];
  for (const [k, n] of a) if ((b.get(k) ?? 0) < n) out.push(k);
  return out;
}

const NEGATORS = /\b(?:not|no|never|none|neither|nor|without|cannot|lack(?:s|ed|ing)?|fail(?:s|ed)? to|absence of)\b|n['’]t\b/gi;
const HEDGES =
  /\b(?:may|might|could|possibly|perhaps|likely|unlikely|suggests?|suggested|appears?|seems?|indicates?|tends? to|partly|partially|somewhat|probably|potentially|arguably|in part)\b/gi;
const BOOSTERS =
  /\b(?:proves?|proven|clearly|definitely|certainly|undoubtedly|unquestionably|always|conclusively|confirms?|establishes|demonstrates?|guarantees?|without doubt|all|every|entirely|completely)\b/gi;
const CAUSAL = /\b(?:causes?|caused|leads? to|led to|results? in|resulted in|drives?|because of|due to|produces?)\b/gi;

const count = (re: RegExp, s: string) => s.match(re)?.length ?? 0;

const CITATION_SHAPES = [
  /\([^()]*?\b(?:1[5-9]\d{2}|20\d{2})[a-z]?\b[^()]*?\)/g,
  /\[\d+(?:\s*[,–\-]\s*\d+)*\]/g,
  /\b\p{Lu}[\p{L}'’-]+(?:\s+(?:et al\.|and|&)\s*\p{Lu}?[\p{L}'’-]*)?\s*\((?:1[5-9]\d{2}|20\d{2})[a-z]?\)/gu,
  /\bhttps?:\/\/\S+/g,
  /\b10\.\d{4,9}\/\S+/g,
];

function citationsIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const re of CITATION_SHAPES) for (const m of text.matchAll(re)) out.add(m[0].replace(/\s+/g, " "));
  return out;
}

function quotesIn(text: string): Set<string> {
  return new Set([...text.matchAll(/“([^”\n]{3,}?)”|"([^"\n]{3,}?)"/g)].map((m) => (m[1] ?? m[2] ?? "").trim()));
}

export type VerifyInput = {
  original: string;
  revised: string;
  restore: RestoreResult;
  glossary: string[];
  modelRisk: "none" | "low" | "high";
  modelNote: string;
  similarity: number | null;
};

const ORDER: Record<RiskLevel, number> = { none: 0, low: 1, medium: 2, high: 3 };

export function maxRisk(flags: Flag[]): RiskLevel {
  return flags.reduce<RiskLevel>((acc, f) => (ORDER[f.level] > ORDER[acc] ? f.level : acc), "none");
}

export function verifySegment(input: VerifyInput): { risk: RiskLevel; flags: Flag[] } {
  const { original, revised, restore } = input;
  const flags: Flag[] = [];

  if (restore.missing.length) {
    const kinds = [...new Set(restore.missing.map(describeToken))].join(", ");
    flags.push({ level: "high", code: "protected_missing", message: `Protected content was dropped (${kinds}).` });
  }
  if (restore.duplicated.length) {
    flags.push({ level: "medium", code: "protected_duplicated", message: "A citation or quotation appears more than once — check placement." });
  }
  if (restore.unknown.length) {
    flags.push({ level: "medium", code: "protected_unknown", message: "The model referenced protected content that is not in this paragraph." });
  }

  const origNums = numbersIn(original);
  const revNums = numbersIn(revised);
  const lostNums = multisetDiff(origNums, revNums);
  const newNums = multisetDiff(revNums, origNums);
  if (lostNums.length) {
    flags.push({ level: "high", code: "number_missing", message: `Figure(s) from the original are missing: ${lostNums.slice(0, 5).join(", ")}.` });
  }
  if (newNums.length) {
    flags.push({ level: "high", code: "number_added", message: `New figure(s) appeared that are not in the original: ${newNums.slice(0, 5).join(", ")}.` });
  }

  const origCites = citationsIn(original);
  const newCites = [...citationsIn(revised)].filter((c) => !origCites.has(c));
  if (newCites.length) {
    flags.push({ level: "high", code: "citation_added", message: `Possible new citation or source not in your text: ${newCites.slice(0, 3).join("; ")}.` });
  }

  const origQuotes = quotesIn(original);
  const newQuotes = [...quotesIn(revised)].filter((q) => !origQuotes.has(q) && q.split(/\s+/).length >= 3);
  if (newQuotes.length) {
    flags.push({ level: "medium", code: "quote_added", message: "New quoted wording appeared — make sure nothing is presented as a quotation that isn't one." });
  }

  const lower = revised.toLowerCase();
  const lostTerms = input.glossary.filter((t) => original.toLowerCase().includes(t.toLowerCase()) && !lower.includes(t.toLowerCase()));
  if (lostTerms.length) {
    flags.push({ level: "medium", code: "term_changed", message: `Protected term(s) changed: ${lostTerms.slice(0, 5).join(", ")}.` });
  }

  const negDelta = count(NEGATORS, revised) - count(NEGATORS, original);
  if (negDelta !== 0) {
    flags.push({ level: "medium", code: "negation", message: "The number of negatives (not, no, never, without…) changed — confirm the claim still points the same way." });
  }

  const hedgeO = count(HEDGES, original);
  const hedgeR = count(HEDGES, revised);
  const boostO = count(BOOSTERS, original);
  const boostR = count(BOOSTERS, revised);
  if ((hedgeO > 0 && hedgeR < hedgeO) || boostR > boostO) {
    flags.push({ level: "medium", code: "certainty_up", message: "The claim may now sound more certain than in your original (hedging removed or stronger wording added)." });
  } else if (hedgeR > hedgeO + 1 || (boostO > 0 && boostR < boostO)) {
    flags.push({ level: "low", code: "certainty_down", message: "The claim may now sound less certain than in your original." });
  }
  if (count(CAUSAL, revised) > count(CAUSAL, original)) {
    flags.push({ level: "medium", code: "causal", message: "Causal language was added (e.g. 'leads to', 'causes') — check you are not implying causation the evidence doesn't support." });
  }

  const wo = countWords(original);
  const wr = countWords(revised);
  if (wo >= 12) {
    const ratio = wr / wo;
    if (ratio < 0.6) flags.push({ level: "medium", code: "much_shorter", message: "Much shorter than your original — check that no idea was dropped." });
    else if (ratio > 1.7) flags.push({ level: "low", code: "much_longer", message: "Much longer than your original — check nothing new was added." });
  }

  if (input.similarity !== null && wo >= 8) {
    if (input.similarity < 0.82) {
      flags.push({ level: "high", code: "low_similarity", message: "Semantic check: the meaning appears to have drifted noticeably." });
    } else if (input.similarity < 0.89) {
      flags.push({ level: "medium", code: "moderate_similarity", message: "Semantic check: some nuance may have shifted." });
    }
  }

  if (input.modelRisk !== "none") {
    flags.push({
      level: input.modelRisk === "high" ? "high" : "low",
      code: "model_self_report",
      message: `Editor's note: ${input.modelNote || "some nuance may have shifted."}`,
    });
  }

  return { risk: maxRisk(flags), flags };
}
