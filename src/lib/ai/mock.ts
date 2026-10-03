import type { ModelSegmentOutput, Provider, RewriteCall } from "./types";

/**
 * Deterministic stand-in for local development and automated tests (never used in production).
 * It performs simple clean-ups so the full pipeline can be exercised offline — and deliberately
 * overstates hedged claims ("may be" → "is") so the meaning-change flags can be seen in the UI.
 */
const SWAPS: [RegExp, string][] = [
  [/\bIt is important to note that\s+(\w)/gi, "$1"],
  [/\bIt is worth noting that\s+(\w)/gi, "$1"],
  [/\bFurthermore,\s*/g, "Beyond this, "],
  [/\bMoreover,\s*/g, "What is more, "],
  [/\bAdditionally,\s*/g, "Also, "],
  [/\bin order to\b/gi, "to"],
  [/\butili[sz]e(s|d)?\b/gi, "use$1"],
  [/\bplays a (crucial|pivotal|vital) role in\b/gi, "matters greatly for"],
  [/\bdelve(s)? into\b/gi, "examine$1"],
  [/\bIn today's fast-paced world,\s*/gi, "Today, "],
  [/\ba myriad of\b/gi, "many"],
  [/\bmay be\b/g, "is"],
  [/\bin the realm of\b/gi, "in"],
];

function edit(text: string): string {
  let out = text;
  for (const [re, rep] of SWAPS) out = out.replace(re, rep);
  return out.replace(/(^|[.!?]\s+)(\p{Ll})/gu, (_, p: string, c: string) => p + c.toUpperCase());
}

export class MockProvider implements Provider {
  model = "mock-editor";

  async rewrite({ input, signal }: RewriteCall): Promise<ModelSegmentOutput[]> {
    const json = input.slice(input.indexOf("{", input.indexOf("Segments to revise")));
    const { segments } = JSON.parse(json) as { segments: { id: string; text: string }[] };
    await new Promise((r, j) => {
      const t = setTimeout(r, 250 + Math.random() * 400);
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        j(Object.assign(new Error("aborted"), { name: "AbortError" }));
      });
    });
    return segments.map((s) => {
      const revised = edit(s.text);
      return {
        id: s.id,
        revised,
        changes: revised === s.text ? "Already natural; left unchanged." : "Removed stock phrases and filler; simplified wording.",
        meaning_risk: "none",
        risk_note: "",
      };
    });
  }

  async embed(texts: string[]): Promise<number[][]> {
    // Bag-of-letters vectors: crude but enough to exercise the similarity path.
    return texts.map((t) => {
      const v = new Array<number>(26).fill(0);
      for (const ch of t.toLowerCase()) {
        const i = ch.charCodeAt(0) - 97;
        if (i >= 0 && i < 26) v[i]! += 1;
      }
      return v;
    });
  }
}
