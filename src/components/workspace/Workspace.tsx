"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Eye, EyeOff, Plus, SlidersHorizontal, Square, WandSparkles, X } from "lucide-react";
import { Alert, Button, cx, useToast } from "@/components/ui";
import { api, ApiError, toApiError } from "@/lib/client";
import type { RewriteOptions } from "@/lib/options";
import { ControlsPanel } from "./ControlsPanel";
import { EditorPane } from "./EditorPane";
import { ExportMenu } from "./ExportMenu";
import { SegmentRow } from "./SegmentRow";
import { SummaryBar } from "./SummaryBar";
import { chosenText, type ClientSegment, type ReadabilityStats, type RewriteSummary } from "./types";

type View = "write" | "compare" | "final";
type Status = "idle" | "running" | "done" | "error";

export type InitialRewrite = {
  id: string;
  title: string;
  original: string;
  options: RewriteOptions;
  segments: ClientSegment[];
  summary: RewriteSummary;
};

type StreamEvent =
  | { type: "ping" }
  | { type: "meta"; segments: { id: string; kind: ClientSegment["kind"]; original: string }[]; before: ReadabilityStats }
  | { type: "segment"; segment: Omit<ClientSegment, "accepted" | "pending"> }
  | { type: "progress"; done: number; total: number }
  | { type: "done"; summary: RewriteSummary; historyId: string | null }
  | { type: "error"; error: { code: string; message: string } };

const DRAFT_KEY = "preader:draft";

async function* readStream(res: Response): AsyncGenerator<StreamEvent> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line) as StreamEvent;
    }
  }
  if (buf.trim()) yield JSON.parse(buf) as StreamEvent;
}

export function Workspace({
  defaults,
  hasVoiceSample,
  maxWords,
  initial,
}: {
  defaults: RewriteOptions;
  hasVoiceSample: boolean;
  maxWords: number;
  initial?: InitialRewrite;
}) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState(initial?.original ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [options, setOptions] = useState<RewriteOptions>({ ...defaults, ...(initial?.options ?? {}), glossary: defaults.glossary });
  const [view, setView] = useState<View>(initial ? "compare" : "write");
  const [status, setStatus] = useState<Status>(initial ? "done" : "idle");
  const [order, setOrder] = useState<string[]>(initial?.segments.map((s) => s.id) ?? []);
  const [segs, setSegs] = useState<Record<string, ClientSegment>>(() => Object.fromEntries((initial?.segments ?? []).map((s) => [s.id, s])));
  const [before, setBefore] = useState<ReadabilityStats | null>(initial?.summary.before ?? null);
  const [summary, setSummary] = useState<RewriteSummary | null>(initial?.summary ?? null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [historyId, setHistoryId] = useState<string | null>(initial?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(true);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const flagCursor = useRef(-1);
  const dirtyRef = useRef(false);

  // Draft survives reloads in this tab only (sessionStorage) — safer on shared or lab computers.
  const savedDraft = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return sessionStorage.getItem(DRAFT_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const [draftDismissed, setDraftDismissed] = useState(false);
  const restorable = useMemo(() => {
    if (initial || draftDismissed || text || !savedDraft) return null;
    try {
      const d = JSON.parse(savedDraft) as { text?: string; title?: string };
      return d.text?.trim() ? d : null;
    } catch {
      return null;
    }
  }, [initial, draftDismissed, text, savedDraft]);
  useEffect(() => {
    if (initial || !text.trim()) return;
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ text, title }));
      } catch {
        /* storage unavailable */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [text, title, initial]);

  const list = useMemo(() => order.map((id) => segs[id]!).filter(Boolean), [order, segs]);
  const textSegs = list.filter((s) => s.kind === "text");
  const flaggedList = textSegs.filter((s) => !s.pending && s.risk !== "none");
  const highCount = textSegs.filter((s) => s.risk === "high").length;
  const finalText = list.map(chosenText).map((t) => t.trim()).filter(Boolean).join("\n\n");
  const running = status === "running";
  const hasResults = order.length > 0;

  const run = useCallback(async () => {
    if (!text.trim() || running) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    setStatus("running");
    setView("compare");
    setSummary(null);
    setHistoryId(null);
    setFlaggedOnly(false);
    setPanelOpen(false);
    flagCursor.current = -1;
    let finished = false;
    try {
      const res = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ text, options, title: title || undefined }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw await toApiError(res);
      for await (const ev of readStream(res)) {
        if (ev.type === "meta") {
          setOrder(ev.segments.map((s) => s.id));
          setSegs(
            Object.fromEntries(
              ev.segments.map((s) => [
                s.id,
                { ...s, risk: "none", flags: [], similarity: null, accepted: "revised", pending: s.kind === "text" } satisfies ClientSegment,
              ]),
            ),
          );
          setBefore(ev.before);
          setProgress({ done: 0, total: ev.segments.length });
        } else if (ev.type === "segment") {
          setSegs((prev) => ({ ...prev, [ev.segment.id]: { ...ev.segment, accepted: "revised", pending: false } }));
        } else if (ev.type === "progress") {
          setProgress({ done: ev.done, total: ev.total });
        } else if (ev.type === "done") {
          finished = true;
          setSummary(ev.summary);
          setHistoryId(ev.historyId);
          setStatus("done");
          dirtyRef.current = false;
          router.refresh();
        } else if (ev.type === "error") {
          throw new ApiError(500, ev.error.code, ev.error.message);
        }
      }
      if (!finished) throw new ApiError(0, "interrupted", "The connection was interrupted before the rewrite finished. Please try again.");
    } catch (err) {
      if (ctrl.signal.aborted) {
        setStatus(order.length ? "done" : "idle");
        setError("Rewrite stopped. Paragraphs that finished are shown; the rest keep your original text.");
      } else {
        setStatus("error");
        setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      }
      setSegs((prev) => Object.fromEntries(Object.entries(prev).map(([k, s]) => [k, s.pending ? { ...s, pending: false, revised: s.original, accepted: "original" as const, changes: "Not rewritten." } : s])));
    } finally {
      abortRef.current = null;
    }
  }, [text, options, title, running, router, order.length]);

  // Ctrl/Cmd + Enter to rewrite
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run]);

  // Persist accept/edit decisions to the saved history entry.
  useEffect(() => {
    if (!historyId || status !== "done" || !dirtyRef.current) return;
    const t = setTimeout(() => {
      dirtyRef.current = false;
      api(`/api/history/${historyId}`, {
        method: "PATCH",
        body: {
          segments: list.map((s) => ({
            id: s.id,
            kind: s.kind,
            original: s.original,
            revised: s.revised ?? s.original,
            accepted: s.accepted,
            edited: s.edited,
          })),
        },
      }).catch(() => toast("Couldn't save your choices to history.", "high"));
    }, 800);
    return () => clearTimeout(t);
  }, [list, historyId, status, toast]);

  const update = useCallback((id: string, patch: Partial<ClientSegment>) => {
    dirtyRef.current = true;
    setSegs((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id]!, ...patch } } : prev));
  }, []);
  const onAccept = useCallback((id: string, accepted: "revised" | "original") => update(id, { accepted }), [update]);
  const onEdit = useCallback((id: string, edited: string) => update(id, { accepted: "edited", edited }), [update]);

  const onRetry = useCallback(
    async (id: string) => {
      const seg = segs[id];
      if (!seg) return;
      setSegs((prev) => ({ ...prev, [id]: { ...prev[id]!, retrying: true } }));
      try {
        const res = await fetch("/api/rewrite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ text: seg.original, options: { ...options, privateMode: true } }),
        });
        if (!res.ok) throw await toApiError(res);
        let got: StreamEvent | null = null;
        for await (const ev of readStream(res)) {
          if (ev.type === "segment" && ev.segment.kind === "text") got = ev;
          if (ev.type === "error") throw new ApiError(500, ev.error.code, ev.error.message);
        }
        if (got?.type !== "segment") throw new ApiError(0, "empty", "No new version came back. Please try again.");
        const s = got.segment;
        update(id, { revised: s.revised, changes: s.changes, risk: s.risk, flags: s.flags, similarity: s.similarity, accepted: "revised", edited: undefined, retrying: false });
        router.refresh();
      } catch (err) {
        toast(err instanceof ApiError ? err.message : "Couldn't rewrite that paragraph.", "high");
        setSegs((prev) => ({ ...prev, [id]: { ...prev[id]!, retrying: false } }));
      }
    },
    [segs, options, update, toast, router],
  );

  function nextFlag() {
    if (!flaggedList.length) return;
    flagCursor.current = (flagCursor.current + 1) % flaggedList.length;
    document.getElementById(`seg-${flaggedList[flagCursor.current]!.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setAll(accepted: "revised" | "original") {
    dirtyRef.current = true;
    setSegs((prev) => Object.fromEntries(Object.entries(prev).map(([k, s]) => [k, s.kind === "text" && !s.pending ? { ...s, accepted } : s])));
  }

  function startNew() {
    if (running) return;
    if (hasResults && !confirm("Start a new document? Your current results stay in History unless you used Private mode.")) return;
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* storage unavailable */
    }
    setText("");
    setTitle("");
    setOrder([]);
    setSegs({});
    setSummary(null);
    setBefore(null);
    setHistoryId(null);
    setError(null);
    setStatus("idle");
    setView("write");
    if (initial) router.push("/app");
  }

  async function saveDefaults() {
    try {
      await api("/api/account", { method: "PATCH", body: { preferences: { ...options, privateMode: options.privateMode } } });
      toast("Saved as your default settings.");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save settings.", "high");
    }
  }

  const visible = flaggedOnly ? list.filter((s) => s.kind === "text" && s.risk !== "none") : list;
  const tabs: { id: View; label: string; disabled?: boolean }[] = [
    { id: "write", label: "Draft" },
    { id: "compare", label: "Compare", disabled: !hasResults },
    { id: "final", label: "Final", disabled: !hasResults },
  ];

  return (
    <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
      {/* Controls: sidebar on desktop, full-screen sheet on mobile */}
      <aside
        className={cx(
          "lg:sticky lg:top-[4.5rem] lg:block lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-y-auto lg:pb-6 lg:pr-1",
          panelOpen ? "fixed inset-0 z-40 block overflow-y-auto bg-canvas px-4 pb-28 pt-4" : "hidden",
        )}
        aria-label="Style settings"
      >
        <div className="mb-4 flex items-center justify-between lg:hidden">
          <h2 className="font-serif text-xl font-semibold">Style settings</h2>
          <Button variant="ghost" size="sm" onClick={() => setPanelOpen(false)} aria-label="Close settings">
            <X className="size-5" />
          </Button>
        </div>
        <ControlsPanel options={options} onChange={setOptions} hasVoiceSample={hasVoiceSample} disabled={running} onSaveDefaults={saveDefaults} />
        {panelOpen && (
          <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-canvas/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
            <Button className="w-full" size="lg" onClick={() => setPanelOpen(false)}>
              Done
            </Button>
          </div>
        )}
      </aside>

      <section className="min-w-0 space-y-5">
        {/* Toolbar */}
        <div className="sticky top-[3.6rem] z-20 -mx-4 flex flex-wrap items-center gap-2 border-b border-line bg-canvas/90 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <div role="tablist" aria-label="View" className="inline-flex rounded-xl bg-sunken p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={view === t.id}
                disabled={t.disabled}
                onClick={() => setView(t.id)}
                className={cx(
                  "rounded-lg px-3 py-1.5 text-sm font-semibold transition-all disabled:opacity-40",
                  view === t.id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setPanelOpen(true)} aria-label="Style settings">
            <SlidersHorizontal className="size-4" />
          </Button>
          {view === "compare" && hasResults && (
            <Button variant="ghost" size="sm" onClick={() => setShowDiff((d) => !d)} aria-pressed={showDiff} title="Show tracked changes">
              {showDiff ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              <span className="hidden sm:inline">{showDiff ? "Hide changes" : "Show changes"}</span>
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {hasResults && !running && <ExportMenu title={title} segments={list} />}
            {hasResults && !running && (
              <Button variant="ghost" size="sm" onClick={startNew} title="New document">
                <Plus className="size-4" />
                <span className="hidden xl:inline">New</span>
              </Button>
            )}
            {running ? (
              <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
                <Square className="size-3.5 fill-current" /> Stop
              </Button>
            ) : (
              <Button onClick={run} disabled={!text.trim()} title="Rewrite (Ctrl/⌘ + Enter)">
                <WandSparkles className="size-4" /> {hasResults ? "Rewrite again" : "Rewrite"}
              </Button>
            )}
          </div>
        </div>

        {error && (
          <Alert tone={status === "error" ? "high" : "medium"} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {view === "write" && restorable && (
          <Alert tone="good" onClose={() => setDraftDismissed(true)}>
            <span className="mr-3">You have an unsaved draft from earlier in this tab.</span>
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => {
                setText(restorable.text ?? "");
                setTitle(restorable.title ?? "");
              }}
            >
              Restore it
            </button>
          </Alert>
        )}

        {view === "write" && <EditorPane text={text} title={title} onText={setText} onTitle={setTitle} maxWords={maxWords} disabled={running} />}

        {view === "compare" && hasResults && (
          <div className="space-y-4">
            <SummaryBar
              before={before}
              after={summary?.after ?? null}
              progress={progress}
              running={running}
              flagged={flaggedList.length}
              high={highCount}
              onNextFlag={nextFlag}
              flaggedOnly={flaggedOnly}
              setFlaggedOnly={setFlaggedOnly}
            />
            {!running && textSegs.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <span>All paragraphs:</span>
                <Button size="sm" variant="ghost" onClick={() => setAll("revised")}>
                  Use revised
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAll("original")}>
                  Keep originals
                </Button>
                {!historyId && summary && <span className="ml-auto text-xs">Private mode — not saved to history</span>}
              </div>
            )}
            <div className="space-y-4">
              {visible.map((s) => (
                <SegmentRow
                  key={s.id}
                  seg={s}
                  index={textSegs.indexOf(s) + 1}
                  showDiff={showDiff}
                  onAccept={onAccept}
                  onEdit={onEdit}
                  onRetry={onRetry}
                  canRetry={!running}
                />
              ))}
              {flaggedOnly && visible.length === 0 && <p className="py-10 text-center text-sm text-muted">No flagged paragraphs.</p>}
            </div>
          </div>
        )}

        {view === "final" && hasResults && (
          <article className="rounded-2xl border border-line bg-surface px-5 py-8 shadow-[var(--shadow-card)] sm:px-12 sm:py-12">
            {title && <h1 className="mb-6 font-serif text-3xl font-semibold tracking-tight">{title}</h1>}
            <div className="prose-doc space-y-5">
              {finalText.split("\n\n").map((p, i) => (
                <p key={i} className="whitespace-pre-wrap">
                  {p}
                </p>
              ))}
            </div>
            <p className="mt-10 border-t border-line pt-4 text-xs text-muted">
              Edited with Preader, powered by Tolbert Innovation Hub. Check flagged passages and follow your institution&apos;s guidance on disclosing AI-assisted editing.
            </p>
          </article>
        )}
      </section>
    </div>
  );
}
