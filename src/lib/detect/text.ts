// Turns a detection model's output (if any) plus writing-pattern context into a
// text result. Pure: no network, no database, so it is fully unit-tested.
import { countWords } from "@/lib/text/words";
import { locateSentences, textPatterns } from "./text-signals";
import { DETECT_LIMITS, THRESHOLDS, type CheckStatus, type Evidence, type Highlight, type ModelScore, type TextResult, type TextVerdict } from "./types";

export type TextModelOutput = { score: ModelScore; sentences: { text: string; ai: number }[] };

export type ModelOutcome<T> = { status: "ok"; name: string; output: T } | { status: "not_configured" | "skipped" | "error"; name: string; message: string };

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const TEXT_CAVEATS = {
  general: "AI detection is probabilistic. Never use this result on its own to accuse anyone or to make a high-stakes decision.",
  fairness:
    "AI detectors are known to flag writing by non-native and African English speakers (including West African and Liberian English) more often than other writing. PanPen uses cautious thresholds and shows “Inconclusive” whenever the evidence is not strong, but please weigh the evidence and talk with the writer.",
  tools: "Text polished with grammar or rewriting tools (including PanPen's own rewriter) can be flagged even when the ideas and drafting are the writer's own.",
  short: `Texts under ${DETECT_LIMITS.minWords} words are too short for any detector to judge reliably.`,
};

export function decideTextVerdict(score: ModelScore, words: number): TextVerdict {
  const short = words < DETECT_LIMITS.solidWords;
  const t = THRESHOLDS.text;
  const lowConfidence = score.confidence?.toLowerCase() === "low";
  const human = score.human ?? 1 - score.ai - (score.mixed ?? 0);
  if (!lowConfidence && score.ai >= (short ? t.aiShort : t.ai)) return "likely_ai";
  if (!lowConfidence && score.mixed !== null && score.mixed >= t.mixed) return "mixed";
  if (!lowConfidence && human >= (short ? t.humanShort : t.human)) return "likely_human";
  return "inconclusive";
}

function headlineFor(verdict: TextVerdict, score: ModelScore | null, words: number, model: ModelOutcome<TextModelOutput>): { headline: string; summary: string } {
  if (words < DETECT_LIMITS.minWords) {
    return {
      headline: "Inconclusive: too short to judge",
      summary: `This text has ${words} word${words === 1 ? "" : "s"}. Detectors need at least ${DETECT_LIMITS.minWords} words of continuous writing to say anything useful, so PanPen did not score it.`,
    };
  }
  if (!score) {
    const why =
      model.status === "not_configured"
        ? "No AI-detection model is connected to PanPen yet, so there is no score."
        : model.status === "error"
          ? `The detection model could not be reached (${"message" in model ? model.message : "unknown error"}), so there is no score.`
          : "No detection model ran, so there is no score.";
    return {
      headline: "Inconclusive: no detection model result",
      summary: `${why} Writing patterns are shown below for context, but PanPen never turns them into a verdict, because they also appear in plenty of human writing.`,
    };
  }
  const by = `${score.provider} estimates a ${pct(score.ai)} chance this text is AI-generated`;
  switch (verdict) {
    case "likely_ai":
      return { headline: "Likely AI-generated", summary: `${by}. Highlighted sentences show where the model found the strongest signals. This is an estimate, not proof.` };
    case "mixed":
      return {
        headline: "Mixed: likely part AI, part human",
        summary: `${score.provider} estimates a ${pct(score.mixed ?? 0)} chance this text mixes human and AI writing. Highlighted sentences show the parts most likely to be AI-generated.`,
      };
    case "likely_human":
      return {
        headline: "Likely human-written",
        summary: `${by}. A low score is not proof of human authorship: edited or paraphrased AI text can also score low.`,
      };
    default:
      return {
        headline: "Inconclusive",
        summary: `${by}, which is not strong enough for a conclusion${words < DETECT_LIMITS.solidWords ? ` (texts under ${DETECT_LIMITS.solidWords} words need a stronger signal)` : ""}. Treat this as uncertain.`,
      };
  }
}

export function buildTextResult(text: string, outcome: ModelOutcome<TextModelOutput>, meta: { id: string; createdAt: string }): TextResult {
  const words = countWords(text);
  // A model is never consulted (or trusted) for text that is too short to judge.
  const model: ModelOutcome<TextModelOutput> =
    words < DETECT_LIMITS.minWords && outcome.status === "ok"
      ? { status: "skipped", name: outcome.name, message: `Skipped: fewer than ${DETECT_LIMITS.minWords} words.` }
      : outcome;
  const patterns = textPatterns(text);
  const highlights: Highlight[] = [...patterns.highlights];
  const evidence: Evidence[] = [];
  const checks: CheckStatus[] = [];
  let score: ModelScore | null = null;

  if (model.status === "ok") {
    score = model.output.score;
    checks.push({ name: model.name, status: "ok", message: "Detection model analysed the text." });
    const spans = locateSentences(
      text,
      model.output.sentences.map((s) => s.text),
    );
    model.output.sentences.forEach((s, i) => {
      const span = spans[i];
      if (span && s.ai >= 0.5) highlights.push({ ...span, kind: "model", ai: s.ai, note: `${pct(s.ai)} AI likelihood for this sentence` });
    });
    const flagged = model.output.sentences.filter((s) => s.ai >= 0.5).length;
    evidence.push({
      id: "model",
      source: "Detection model",
      // A "mixed" probability still means some AI involvement, so it counts towards AI here.
      direction: score.ai + (score.mixed ?? 0) >= 0.5 ? "ai" : "human",
      strength: Math.abs(score.ai + (score.mixed ?? 0) - 0.5) >= 0.35 ? "strong" : Math.abs(score.ai + (score.mixed ?? 0) - 0.5) >= 0.2 ? "moderate" : "weak",
      title: `${score.provider}: ${pct(score.ai)} AI likelihood`,
      detail: [
        `AI ${pct(score.ai)}`,
        score.mixed !== null ? `mixed ${pct(score.mixed)}` : null,
        score.human !== null ? `human ${pct(score.human)}` : null,
        score.confidence ? `model confidence: ${score.confidence}` : null,
        model.output.sentences.length ? `${flagged} of ${model.output.sentences.length} sentences scored 50% or higher` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  } else {
    checks.push({ name: model.name, status: model.status, message: model.message });
  }
  checks.push({ name: "Writing patterns", status: "ok", message: "Checked for chatbot leftovers, hidden characters, stock phrases and rhythm (context only)." });
  checks.push({ name: "Text watermarks", status: "skipped", message: "No major AI provider offers a public text-watermark check, so PanPen can't test for one." });

  const verdict: TextVerdict = score ? decideTextVerdict(score, words) : "inconclusive";
  const { headline, summary } = headlineFor(verdict, score, words, model);

  const caveats = [TEXT_CAVEATS.general, TEXT_CAVEATS.fairness, TEXT_CAVEATS.tools];
  if (words < DETECT_LIMITS.minWords) caveats.unshift(TEXT_CAVEATS.short);

  highlights.sort((a, b) => a.start - b.start || b.end - a.end);
  return {
    kind: "text",
    id: meta.id,
    createdAt: meta.createdAt,
    verdict,
    headline,
    summary,
    score,
    words,
    text,
    highlights,
    evidence: [...evidence, ...patterns.evidence],
    checks,
    caveats,
  };
}
