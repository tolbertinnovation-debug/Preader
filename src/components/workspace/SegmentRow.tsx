"use client";

import { diffWords } from "diff";
import { memo, useMemo, useState } from "react";
import { Check, Pencil, RefreshCw, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Badge, Button, cx } from "@/components/ui";
import { chosenText, type ClientSegment, type RiskLevel } from "./types";

const RISK_UI: Record<RiskLevel, { label: string; tone: "good" | "low" | "medium" | "high"; border: string }> = {
  none: { label: "Meaning preserved", tone: "good", border: "border-l-forest/50" },
  low: { label: "Minor — review", tone: "low", border: "border-l-risk-low" },
  medium: { label: "Check meaning", tone: "medium", border: "border-l-risk-medium" },
  high: { label: "Meaning may have changed", tone: "high", border: "border-l-risk-high" },
};

function Diff({ a, b }: { a: string; b: string }) {
  const parts = useMemo(() => diffWords(a, b), [a, b]);
  return (
    <>
      {parts.map((p, i) =>
        p.added ? (
          <ins key={i} className="diff-add no-underline">
            {p.value}
          </ins>
        ) : p.removed ? (
          <del key={i} className="diff-del">
            {p.value}
          </del>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </>
  );
}

export const SegmentRow = memo(function SegmentRow({
  seg,
  index,
  showDiff,
  onAccept,
  onEdit,
  onRetry,
  canRetry,
}: {
  seg: ClientSegment;
  index: number;
  showDiff: boolean;
  onAccept: (id: string, a: "revised" | "original") => void;
  onEdit: (id: string, text: string) => void;
  onRetry: (id: string) => void;
  canRetry: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (seg.kind !== "text") {
    return (
      <div id={`seg-${seg.id}`} className="rounded-xl border border-dashed border-line px-4 py-3">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          <ShieldCheck className="size-3.5" /> {seg.kind === "heading" ? "Heading — kept as written" : "Preserved verbatim"}
        </div>
        <p className={cx("whitespace-pre-wrap text-ink-soft", seg.kind === "heading" ? "font-serif text-lg font-semibold text-ink" : "line-clamp-4 text-sm")}>{seg.original}</p>
      </div>
    );
  }

  const ui = RISK_UI[seg.risk];
  const current = chosenText(seg);

  return (
    <article id={`seg-${seg.id}`} className={cx("scroll-mt-28 rounded-2xl border border-l-4 border-line bg-surface shadow-[var(--shadow-card)]", seg.pending ? "border-l-line" : ui.border)}>
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="font-serif text-sm font-semibold text-muted">¶ {index}</span>
        {seg.pending || seg.retrying ? (
          <Badge>Rewriting…</Badge>
        ) : (
          <Badge tone={ui.tone}>
            {seg.risk === "none" ? <ShieldCheck className="size-3" /> : <TriangleAlert className="size-3" />}
            {ui.label}
          </Badge>
        )}
        {seg.accepted === "original" && !seg.pending && <Badge>Using original</Badge>}
        {seg.accepted === "edited" && <Badge tone="gold">Edited by you</Badge>}
        {seg.similarity !== null && !seg.pending && (
          <span className="text-[11px] text-muted" title="Semantic similarity between original and revision">
            {Math.round(seg.similarity * 100)}% similar in meaning
          </span>
        )}
        {seg.voice && seg.voice.total > 0 && !seg.pending && (
          <span className="text-[11px] text-muted" title="Share of your own words kept in this paragraph">
            · {Math.round((seg.voice.kept / seg.voice.total) * 100)}% your words
          </span>
        )}
        {!seg.pending && (
          <div className="ml-auto flex items-center gap-1">
            {seg.accepted !== "revised" && (
              <Button size="sm" variant="ghost" onClick={() => onAccept(seg.id, "revised")} title="Use the revised version">
                <Check className="size-3.5" /> <span className="hidden sm:inline">Use revised</span>
              </Button>
            )}
            {seg.accepted !== "original" && (
              <Button size="sm" variant="ghost" onClick={() => onAccept(seg.id, "original")} title="Keep your original paragraph">
                <RotateCcw className="size-3.5" /> <span className="hidden sm:inline">Keep original</span>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(current);
                setEditing(true);
              }}
              title="Edit this paragraph"
            >
              <Pencil className="size-3.5" /> <span className="hidden sm:inline">Edit</span>
            </Button>
            {canRetry && (
              <Button size="sm" variant="ghost" onClick={() => onRetry(seg.id)} disabled={seg.retrying} title="Rewrite this paragraph again">
                <RefreshCw className={cx("size-3.5", seg.retrying && "animate-spin")} />
              </Button>
            )}
          </div>
        )}
      </header>

      <div className="grid md:grid-cols-2">
        <div className="border-b border-line px-4 py-4 md:border-b-0 md:border-r sm:px-5">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Original</div>
          <p className="prose-doc whitespace-pre-wrap !text-[15px] !leading-relaxed text-ink-soft">{seg.original}</p>
        </div>
        <div className="px-4 py-4 sm:px-5">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-forest">
            {seg.accepted === "edited" ? "Your edit" : seg.accepted === "original" ? "Revised (not used)" : "Revised"}
          </div>
          {seg.pending ? (
            <div className="space-y-2.5 py-1" aria-label="Rewriting">
              {[92, 100, 85, 60].map((w, i) => (
                <div key={i} className="h-3.5 animate-pulse rounded bg-sunken" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : editing ? (
            <div>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.min(16, Math.max(4, Math.ceil(draft.length / 70)))}
                className="prose-doc w-full rounded-xl border border-line-strong bg-canvas p-3 !text-[15px] focus:border-forest focus:outline-none"
                autoFocus
                aria-label="Edit paragraph"
              />
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    onEdit(seg.id, draft.trim());
                    setEditing(false);
                  }}
                  disabled={!draft.trim()}
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className={cx("prose-doc whitespace-pre-wrap !text-[15px] !leading-relaxed", seg.accepted === "original" && "opacity-55")}>
              {showDiff && seg.accepted !== "edited" ? <Diff a={seg.original} b={seg.revised ?? ""} /> : seg.accepted === "edited" ? seg.edited : seg.revised}
            </p>
          )}
        </div>
      </div>

      {!seg.pending && (seg.flags.length > 0 || seg.changes || (seg.voice?.dropped.length ?? 0) > 0) && (
        <footer className="space-y-2 border-t border-line bg-sunken/40 px-4 py-3 text-[13px] sm:px-5">
          {seg.flags.map((f, i) => (
            <div key={i} className="flex items-start gap-2">
              <TriangleAlert
                className={cx("mt-0.5 size-3.5 shrink-0", f.level === "high" ? "text-risk-high" : f.level === "medium" ? "text-risk-medium" : "text-risk-low")}
                aria-label={`${f.level} risk`}
              />
              <span className="text-ink-soft">{f.message}</span>
            </div>
          ))}
          {seg.voice && seg.voice.dropped.length > 0 && (
            <p className="text-ink-soft">
              <span className="font-medium text-gold">Your expression{seg.voice.dropped.length === 1 ? "" : "s"} reworded:</span>{" "}
              {seg.voice.dropped.map((d) => `“${d}”`).join(", ")}. Keep your original or edit this paragraph if you want {seg.voice.dropped.length === 1 ? "it" : "them"} back.
            </p>
          )}
          {seg.changes && <p className="text-muted">✎ {seg.changes}</p>}
        </footer>
      )}
    </article>
  );
});
