"use client";

import { ArrowDown, ArrowRight, Feather, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button, cx } from "@/components/ui";
import type { ReadabilityStats, VoiceSummary } from "./types";

type Metric = { label: string; key: keyof ReadabilityStats; better: "up" | "down" | "none"; hint: string };

const METRICS: Metric[] = [
  { label: "Robotic phrases", key: "roboticPhrases", better: "down", hint: "Stock phrases typical of generic machine prose" },
  { label: "Rhythm variety", key: "rhythmVariety", better: "up", hint: "Variation in sentence length — natural writing varies" },
  { label: "Reading ease", key: "readingEase", better: "none", hint: "Flesch Reading Ease (higher is easier)" },
  { label: "Grade level", key: "gradeLevel", better: "none", hint: "Approximate school grade needed to read comfortably" },
  { label: "Avg sentence", key: "avgSentenceLength", better: "none", hint: "Average words per sentence" },
  { label: "Words", key: "words", better: "none", hint: "Total words" },
];

export function SummaryBar({
  before,
  after,
  progress,
  running,
  flagged,
  high,
  onNextFlag,
  flaggedOnly,
  setFlaggedOnly,
  voice,
}: {
  before: ReadabilityStats | null;
  after: ReadabilityStats | null;
  progress: { done: number; total: number };
  running: boolean;
  flagged: number;
  high: number;
  onNextFlag: () => void;
  flaggedOnly: boolean;
  setFlaggedOnly: (v: boolean) => void;
  voice?: VoiceSummary | null;
}) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
      {running && (
        <div className="mb-4">
          <div className="mb-1.5 flex justify-between text-xs font-medium text-ink-soft">
            <span>Rewriting and checking each paragraph…</span>
            <span>
              {progress.done}/{progress.total}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="kente h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(4, pct)}%` }} />
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {METRICS.map((m) => {
          const b = before?.[m.key];
          const a = after?.[m.key];
          const improved = a !== undefined && b !== undefined && ((m.better === "up" && a > b) || (m.better === "down" && a < b));
          return (
            <div key={m.key} className="rounded-xl bg-sunken/60 px-3 py-2" title={m.hint}>
              <div className="text-[11px] font-medium text-muted">{m.label}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold tabular-nums">
                <span className={cx(a !== undefined && "text-muted")}>{b ?? "—"}</span>
                {a !== undefined && (
                  <>
                    <ArrowRight className="size-3 text-muted" />
                    <span className={cx(improved ? "text-forest" : "text-ink")}>{a}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!running && voice && <VoiceStrip voice={voice} />}
      {!running && after && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
          {flagged === 0 ? (
            <span className="inline-flex items-center gap-2 text-sm font-medium text-forest">
              <ShieldCheck className="size-4" /> No meaning changes detected. Still, read it through — it&apos;s your work.
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 text-sm font-medium text-ink">
              <TriangleAlert className={cx("size-4", high ? "text-risk-high" : "text-risk-medium")} />
              {flagged} paragraph{flagged === 1 ? "" : "s"} to review{high ? ` · ${high} where meaning may have changed` : ""}
            </span>
          )}
          {flagged > 0 && (
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="secondary" onClick={onNextFlag}>
                <ArrowDown className="size-3.5" /> Next flag
              </Button>
              <Button size="sm" variant={flaggedOnly ? "primary" : "ghost"} onClick={() => setFlaggedOnly(!flaggedOnly)} aria-pressed={flaggedOnly}>
                Flagged only
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** "Sounds like you": how much of the writer's own wording, expressions and rhythm survived. */
function VoiceStrip({ voice }: { voice: VoiceSummary }) {
  const kept = Math.round(voice.wordsKept * 100);
  const target = voice.rhythm.target;
  const rhythmClose = target !== null ? Math.abs(voice.rhythm.after - target) <= 3 : Math.abs(voice.rhythm.after - voice.rhythm.before) <= 3;
  return (
    <div className="mt-4 rounded-xl border border-forest/20 bg-forest-soft/50 px-3 py-2.5">
      <div className="flex items-center gap-2 text-sm font-semibold text-forest">
        <Feather className="size-4" /> Sounds like you
        <span className="text-[11px] font-normal text-muted">measured from your {voice.reference === "sample" ? "writing sample" : "draft"}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-soft">
        <span title="Share of your own content words still in the revision">
          <strong className="tabular-nums text-ink">{kept}%</strong> of your own words kept
        </span>
        {voice.expressionsTotal > 0 && (
          <span title="Your expressions that were kept word for word">
            <strong className="tabular-nums text-ink">
              {voice.expressionsKept}/{voice.expressionsTotal}
            </strong>{" "}
            of your expressions kept
          </span>
        )}
        <span title="Average words per sentence">
          Sentence length <strong className="tabular-nums text-ink">{voice.rhythm.before}</strong> → <strong className={cx("tabular-nums", rhythmClose ? "text-forest" : "text-risk-medium")}>{voice.rhythm.after}</strong>
          {target !== null && <span className="text-muted"> (your usual: {target})</span>}
        </span>
      </div>
    </div>
  );
}
