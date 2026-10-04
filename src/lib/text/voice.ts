// "Sounds like you": measures how a person writes (rhythm, contractions, person,
// spelling, punctuation, recurring expressions and favourite words), so revisions can
// be steered towards — and checked against — the writer's own habits.
// Pure and client-safe: the same profile is shown in Settings and used by the server.
import { ROBOTIC_PHRASES } from "./cliches";
import { splitSentences } from "./readability";
import { words as tokenize } from "./words";

export const VOICE_LIMITS = {
  /** Below this, a profile isn't meaningful. */
  minWords: 80,
  maxPinned: 30,
  maxPinnedChars: 60,
  /** Expressions passed to the editor per paragraph. */
  maxKeepPerSegment: 12,
} as const;

const STOP = new Set(
  `a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just let me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves s t don isn aren wasn weren hasn haven hadn doesn didn won wouldn shan shouldn can't cannot one two also may might must shall upon within without among however therefore thus yet still even many much every another each`.split(
    /\s+/,
  ),
);

const ROBOTIC = new Set(ROBOTIC_PHRASES.map((p) => p.replace(/[,]/g, "").trim()));

export type VoiceProfile = {
  words: number;
  sentences: number;
  rhythm: { avg: number; p25: number; p75: number; shortShare: number; longShare: number };
  contractions: "often" | "sometimes" | "rarely";
  person: "I" | "we" | "both" | "neither";
  spelling: "british" | "american" | "mixed" | "unknown";
  /** Habits per 1,000 words. */
  punctuation: { dashes: number; semicolons: number; exclamations: number; questions: number; parentheses: number };
  /** Multi-word phrases the writer repeats. */
  expressions: string[];
  /** Content words the writer leans on. */
  favouriteWords: string[];
};

const CONTRACTION = /\b(?:\w+n['’]t|(?:i|you|we|they)['’](?:re|ve|ll|d)|i['’]m|(?:it|that|there|what|he|she|let|here|who)['’]s|(?:he|she|it|that)['’](?:ll|d))\b/gi;
const BRITISH = /\b(?:colour|favour|honour|labour|neighbour|behaviour|organis\w*|realis\w*|recognis\w*|prioritis\w*|emphasis(?:e|ed|es|ing)|analys(?:e|ed|es|ing)|centre|programme|travelled|travelling|licence|defence|catalogue)\b/gi;
const AMERICAN = /\b(?:color|favor|honor|labor|neighbor|behavior|organiz\w*|realiz\w*|recogniz\w*|prioritiz\w*|emphasiz\w*|analyz\w*|center|traveled|traveling|license|defense|catalog)\b/gi;

const count = (re: RegExp, s: string) => s.match(re)?.length ?? 0;
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Lower-cases and folds hyphens, curly quotes and spacing so "Small-small" matches "small small". */
export function normalisePhrase(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[-–—\s]+/g, " ")
    .trim();
}

function stem(t: string): string {
  if (t.length <= 4) return t;
  if (t.length > 5) return t.replace(/(?:ing|ed|es|s|ly)$/, "");
  return t.replace(/s$/, "");
}

const lower = (t: string) => t.toLowerCase().replace(/’/g, "'");
const isContent = (t: string) => t.length >= 3 && !STOP.has(t) && /\p{L}/u.test(t);

/** Repeated multi-word phrases (2–4 words, within sentences) that contain at least one content word. */
function recurringExpressions(sentences: string[]): string[] {
  const counts = new Map<string, number>();
  for (const s of sentences) {
    const toks = tokenize(s).map(lower);
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= toks.length; i++) {
        const gram = toks.slice(i, i + n);
        if (!gram.some(isContent)) continue;
        if (STOP.has(gram[gram.length - 1]!) || ["the", "a", "an", "and", "of", "to"].includes(gram[0]!)) continue;
        const key = gram.join(" ");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  const repeated = [...counts].filter(([k, n]) => n >= 2 && !ROBOTIC.has(k));
  // Drop a phrase when a longer phrase containing it occurs just as often.
  const kept = repeated.filter(([k, n]) => !repeated.some(([o, m]) => o !== k && m >= n && o.includes(k) && o.length > k.length));
  return kept
    .sort((a, b) => b[1] * b[0].split(" ").length - a[1] * a[0].split(" ").length || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([k]) => k);
}

/** Doubled words such as "small small" / "small-small" — common, meaningful emphasis in West African English. */
export function reduplications(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(\p{L}{2,})[\s-]\1\b/giu)) {
    const w = m[1]!.toLowerCase();
    if (!["that", "had", "is", "the", "very", "so", "no", "bye", "ha"].includes(w)) out.add(m[0]);
  }
  return [...out];
}

export function buildVoiceProfile(text: string): VoiceProfile | null {
  const tokens = tokenize(text);
  if (tokens.length < VOICE_LIMITS.minWords) return null;
  const sentences = splitSentences(text);
  const lengths = sentences.map((s) => tokenize(s).length).filter((n) => n > 0);
  const sorted = [...lengths].sort((a, b) => a - b);
  const wc = tokens.length;
  const per = (n: number, base: number) => (n * base) / wc;

  const contr = per(count(CONTRACTION, text), 100);
  const lc = tokens.map(lower);
  const firstSing = lc.filter((t) => t === "i" || t === "me" || t === "my" || t === "mine" || t === "i'm" || t === "i've").length;
  const firstPl = lc.filter((t) => t === "we" || t === "us" || t === "our" || t === "ours" || t === "we're" || t === "we've").length;
  const person: VoiceProfile["person"] =
    firstSing >= 3 && firstPl >= 3 ? (firstSing > firstPl * 3 ? "I" : firstPl > firstSing * 3 ? "we" : "both") : firstSing >= 2 ? "I" : firstPl >= 2 ? "we" : "neither";
  const brit = count(BRITISH, text);
  const amer = count(AMERICAN, text);
  const spelling: VoiceProfile["spelling"] = brit + amer === 0 ? "unknown" : brit && amer ? (brit >= amer * 3 ? "british" : amer >= brit * 3 ? "american" : "mixed") : brit ? "british" : "american";

  // Favourite words: grouped by stem (so "school" and "schools" count together), skipping proper names.
  const groups = new Map<string, { n: number; forms: Map<string, number>; lowerSeen: boolean }>();
  tokens.forEach((raw, i) => {
    const t = lc[i]!;
    if (!isContent(t) || /^\d/.test(t)) return;
    const g = groups.get(stem(t)) ?? { n: 0, forms: new Map(), lowerSeen: false };
    g.n++;
    g.forms.set(t, (g.forms.get(t) ?? 0) + 1);
    if (raw[0] !== raw[0]!.toUpperCase()) g.lowerSeen = true;
    groups.set(stem(t), g);
  });
  const minFav = wc >= 400 ? 3 : 2;
  const favouriteWords = [...groups.values()]
    .filter((g) => g.n >= minFav && g.lowerSeen)
    .map((g) => ({ n: g.n, word: [...g.forms].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]![0] }))
    .sort((a, b) => b.n - a.n || a.word.localeCompare(b.word))
    .slice(0, 12)
    .map((g) => g.word);

  // Doubled words first; drop longer phrases that only repeat them ("learn small small" once "small small" is kept).
  const doubled = [...new Set(reduplications(text).map(normalisePhrase))];
  const expressions = [...doubled, ...recurringExpressions(sentences).filter((e) => !doubled.some((d) => normalisePhrase(e).includes(d)))].slice(0, 12);

  return {
    words: wc,
    sentences: lengths.length,
    rhythm: {
      avg: round(wc / Math.max(1, lengths.length)),
      p25: Math.round(quantile(sorted, 0.25)),
      p75: Math.round(quantile(sorted, 0.75)),
      shortShare: round(lengths.filter((n) => n <= 8).length / Math.max(1, lengths.length), 2),
      longShare: round(lengths.filter((n) => n >= 25).length / Math.max(1, lengths.length), 2),
    },
    contractions: contr >= 1.2 ? "often" : contr >= 0.3 ? "sometimes" : "rarely",
    person,
    spelling,
    punctuation: {
      dashes: round(per(count(/—|–|\s-\s/g, text), 1000)),
      semicolons: round(per(count(/;/g, text), 1000)),
      exclamations: round(per(count(/!/g, text), 1000)),
      questions: round(per(count(/\?/g, text), 1000)),
      parentheses: round(per(count(/\(/g, text), 1000)),
    },
    expressions,
    favouriteWords,
  };
}

/** Plain-language description of a profile, used both in the UI and in the editor's brief. */
export function describeVoice(p: VoiceProfile): { label: string; detail: string }[] {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const out: { label: string; detail: string }[] = [
    {
      label: "Sentence rhythm",
      detail: `About ${p.rhythm.avg} words per sentence on average, mostly between ${p.rhythm.p25} and ${p.rhythm.p75}; ${pct(p.rhythm.shortShare)} short (8 words or fewer) and ${pct(p.rhythm.longShare)} long (25 or more).`,
    },
    {
      label: "Contractions",
      detail: p.contractions === "often" ? "Used often (don't, it's, we're)." : p.contractions === "sometimes" ? "Used now and then." : "Rarely used; words are written out in full.",
    },
    {
      label: "Point of view",
      detail:
        p.person === "I"
          ? "Mostly first person singular (I, my)."
          : p.person === "we"
            ? "Mostly first person plural (we, our)."
            : p.person === "both"
              ? "Both I and we."
              : "Mostly impersonal; little first person.",
    },
  ];
  if (p.spelling !== "unknown") {
    out.push({ label: "Spelling", detail: p.spelling === "mixed" ? "A mix of British and American spellings." : p.spelling === "british" ? "British spelling (colour, organise)." : "American spelling (color, organize)." });
  }
  const habits: string[] = [];
  if (p.punctuation.dashes >= 4) habits.push("uses dashes freely");
  if (p.punctuation.semicolons >= 3) habits.push("likes semicolons");
  if (p.punctuation.semicolons === 0 && p.words >= 300) habits.push("avoids semicolons");
  if (p.punctuation.exclamations >= 2) habits.push("uses exclamation marks");
  if (p.punctuation.questions >= 4) habits.push("asks questions");
  if (p.punctuation.parentheses >= 4) habits.push("adds asides in brackets");
  if (habits.length) out.push({ label: "Punctuation", detail: `${habits.join(", ").replace(/^./, (c) => c.toUpperCase())}.` });
  if (p.favouriteWords.length) out.push({ label: "Favourite words", detail: p.favouriteWords.join(", ") });
  if (p.expressions.length) out.push({ label: "Expressions", detail: p.expressions.map((e) => `“${e}”`).join(", ") });
  return out;
}

/** Expressions that should survive in a given paragraph: the writer's pinned phrases, their recurring expressions and any doubled-word emphasis. */
export function expressionsToKeep(segment: string, candidates: string[]): string[] {
  const norm = normalisePhrase(segment);
  const found = new Map<string, string>();
  for (const r of reduplications(segment)) found.set(normalisePhrase(r), r);
  for (const c of candidates) {
    const n = normalisePhrase(c);
    if (n.length < 2 || found.has(n)) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[\\s\\-–—]+")}(?![\\p{L}\\p{N}])`, "iu");
    const m = re.exec(segment.replace(/’/g, "'"));
    if (m && norm.includes(n)) found.set(n, segment.slice(m.index, m.index + m[0].length));
  }
  return [...found.values()].slice(0, VOICE_LIMITS.maxKeepPerSegment);
}

/** Expressions from `keep` that no longer appear in the revision. */
export function droppedExpressions(revised: string, keep: string[]): string[] {
  const norm = ` ${normalisePhrase(revised).replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ")} `;
  return keep.filter((k) => !norm.includes(` ${normalisePhrase(k).replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ")} `));
}

/** Share (0–1) of the writer's content words that are still in the revision. */
export function wordsKept(original: string, revised: string): { kept: number; total: number } {
  const bag = new Map<string, number>();
  for (const t of tokenize(revised).map(lower)) if (isContent(t)) bag.set(stem(t), (bag.get(stem(t)) ?? 0) + 1);
  let total = 0;
  let kept = 0;
  for (const t of tokenize(original).map(lower)) {
    if (!isContent(t)) continue;
    total++;
    const k = stem(t);
    const n = bag.get(k) ?? 0;
    if (n > 0) {
      kept++;
      bag.set(k, n - 1);
    }
  }
  return { kept, total };
}

/** Sanitises a user's pinned expressions list. */
export function cleanPinned(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of list) {
    if (typeof v !== "string") continue;
    const s = v.replace(/\s+/g, " ").trim().slice(0, VOICE_LIMITS.maxPinnedChars);
    const n = normalisePhrase(s);
    if (!s || seen.has(n)) continue;
    seen.add(n);
    out.push(s);
    if (out.length >= VOICE_LIMITS.maxPinned) break;
  }
  return out;
}
