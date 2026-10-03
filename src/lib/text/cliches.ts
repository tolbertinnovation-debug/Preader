/**
 * Phrases and constructions that make prose read as generic or machine-written.
 * Used to brief the model, to score drafts, and to highlight what remains.
 */
export const ROBOTIC_PHRASES: string[] = [
  "delve into",
  "delves into",
  "delving into",
  "in today's fast-paced world",
  "in today's world",
  "in today's digital age",
  "in the ever-evolving",
  "ever-changing landscape",
  "it is important to note that",
  "it is worth noting that",
  "it should be noted that",
  "it is crucial to",
  "plays a crucial role",
  "plays a pivotal role",
  "plays a vital role",
  "a testament to",
  "in the realm of",
  "rich tapestry",
  "tapestry of",
  "navigate the complexities",
  "navigating the complexities",
  "the intricacies of",
  "a myriad of",
  "a plethora of",
  "shed light on",
  "sheds light on",
  "pave the way",
  "paves the way",
  "at the end of the day",
  "in conclusion,",
  "in summary,",
  "to sum up,",
  "last but not least",
  "first and foremost",
  "serves as a",
  "stands as a",
  "underscores the importance",
  "highlights the importance",
  "a deeper understanding",
  "foster a sense of",
  "fostering a culture",
  "unlock the potential",
  "unlocking the potential",
  "harness the power",
  "harnessing the power",
  "embark on a journey",
  "embarking on",
  "the landscape of",
  "multifaceted",
  "holistic approach",
  "seamlessly",
  "seamless integration",
  "cutting-edge",
  "game-changer",
  "game changer",
  "leverage",
  "leveraging",
  "utilize",
  "utilizes",
  "utilization",
  "robust framework",
  "meticulous",
  "meticulously",
  "intricate",
  "commendable",
  "noteworthy",
  "ever-evolving",
  "dynamic landscape",
  "vibrant tapestry",
  "nuanced understanding",
  "not only",
  "moreover,",
  "furthermore,",
  "additionally,",
  "consequently,",
  "nevertheless,",
  "in essence,",
  "notably,",
  "ultimately,",
  "overall,",
  "as an ai",
  "it's not just",
  "whether you're",
];

const ESCAPED = ROBOTIC_PHRASES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]"));
const PATTERN = new RegExp(`(?<![\\p{L}])(?:${ESCAPED.join("|")})(?![\\p{L}])`, "giu");

export type ClicheHit = { phrase: string; index: number; length: number };

export function findCliches(text: string): ClicheHit[] {
  const hits: ClicheHit[] = [];
  for (const m of text.matchAll(PATTERN)) {
    hits.push({ phrase: m[0].toLowerCase(), index: m.index!, length: m[0].length });
  }
  return hits;
}

/** Counts paragraphs/sentences that open with the same word — a common sign of mechanical rhythm. */
export function repeatedOpeners(sentences: string[]): number {
  const counts = new Map<string, number>();
  for (const s of sentences) {
    const first = s.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^\p{L}]/gu, "");
    if (first) counts.set(first, (counts.get(first) ?? 0) + 1);
  }
  let repeats = 0;
  for (const [w, n] of counts) if (n > 2 && !["the", "a", "i", "we", "this", "it"].includes(w)) repeats += n - 2;
  return repeats;
}
