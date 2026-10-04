"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Braces,
  CircleHelp,
  FileDown,
  FileText,
  FileUp,
  ImageIcon,
  ImageUp,
  Info,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { PoweredBy } from "@/components/powered-by";
import { Alert, Button, Card, Segmented, cx, inputClass, useToast } from "@/components/ui";
import { ApiError, downloadBlob, toApiError } from "@/lib/client";
import { countWords } from "@/lib/text/words";
import {
  DETECT_LIMITS,
  VERDICT_LABEL,
  VERDICT_TONE,
  type CheckStatus,
  type DetectResult,
  type Evidence,
  type Highlight,
  type HighlightKind,
  type ImageResult,
  type ModelScore,
  type Sealed,
  type TextResult,
} from "@/lib/detect/types";

type Mode = "text" | "image";
type Props = { used: number; limit: number; maxImageMb: number; textModel: string | null; imageModel: string | null };

const pct = (n: number) => `${Math.round(n * 100)}%`;

const TONE_STYLES = {
  ai: { card: "border-clay/40 bg-clay-soft", text: "text-clay", icon: Sparkles },
  human: { card: "border-forest/40 bg-forest-soft", text: "text-forest", icon: UserRound },
  neutral: { card: "border-line-strong bg-sunken", text: "text-ink-soft", icon: CircleHelp },
  warning: { card: "border-risk-low/40 bg-risk-low-bg", text: "text-risk-low", icon: ShieldAlert },
} as const;

export function Detector({ used, limit, maxImageMb, textModel, imageModel }: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ file: File; url: string; previewable: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sealed, setSealed] = useState<Sealed | null>(null);
  const [checksUsed, setChecksUsed] = useState(used);
  const [dragging, setDragging] = useState(false);
  const docRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const words = useMemo(() => countWords(text), [text]);
  const left = Math.max(0, limit - checksUsed);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (!image) return;
    return () => URL.revokeObjectURL(image.url);
  }, [image]);
  useEffect(() => {
    if (sealed) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [sealed]);

  function switchMode(m: Mode) {
    abortRef.current?.abort();
    setMode(m);
    setSealed(null);
    setError(null);
  }

  async function checkText() {
    setError(null);
    setSealed(null);
    setBusy(true);
    abortRef.current = new AbortController();
    try {
      const res = await fetch("/api/detect/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        credentials: "same-origin",
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw await toApiError(res);
      setSealed((await res.json()) as Sealed);
      setChecksUsed((n) => n + 1);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError(err instanceof ApiError ? err.message : "The check failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function checkImage() {
    if (!image) return;
    setError(null);
    setSealed(null);
    setBusy(true);
    abortRef.current = new AbortController();
    try {
      const fd = new FormData();
      fd.set("image", image.file, image.file.name);
      const res = await fetch("/api/detect/image", { method: "POST", body: fd, credentials: "same-origin", signal: abortRef.current.signal });
      if (!res.ok) throw await toApiError(res);
      setSealed((await res.json()) as Sealed);
      setChecksUsed((n) => n + 1);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError(err instanceof ApiError ? err.message : "The check failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadDoc(file: File) {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/files/parse", { method: "POST", body: fd, credentials: "same-origin" });
      if (!res.ok) throw await toApiError(res);
      const data = (await res.json()) as { text: string };
      setText(data.text);
      setSealed(null);
      toast(`Loaded ${file.name}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't read that file.");
    } finally {
      setUploading(false);
    }
  }

  function pickImage(file: File | undefined) {
    if (!file) return;
    setError(null);
    setSealed(null);
    if (file.size > maxImageMb * 1024 * 1024) {
      setError(`Images must be ${maxImageMb} MB or smaller. Please check the original file rather than a compressed copy if you can.`);
      return;
    }
    // HEIC and some AVIF files can't be previewed in every browser; the check still works.
    const previewable = /^image\/(jpeg|png|webp|gif|avif)$/.test(file.type);
    setImage({ file, url: URL.createObjectURL(file), previewable });
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    pickImage(e.dataTransfer.files[0]);
  }

  async function downloadReport() {
    if (!sealed) return;
    try {
      const res = await fetch("/api/detect/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sealed),
        credentials: "same-origin",
      });
      if (!res.ok) throw await toApiError(res);
      downloadBlob(await res.blob(), `panpen-detection-report-${sealed.result.id}.docx`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't create the report.", "high");
    }
  }

  function downloadJson() {
    if (!sealed) return;
    downloadBlob(new Blob([JSON.stringify(sealed, null, 2)], { type: "application/json" }), `panpen-detection-${sealed.result.id}.json`);
  }

  const model = mode === "text" ? textModel : imageModel;

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-3xl font-semibold tracking-tight">AI Content Detector</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Check text and images for signs of AI generation. Every result shows the evidence behind it, and says “Inconclusive” when the evidence isn&apos;t strong enough.
          </p>
          <PoweredBy className="mt-2" />
        </div>
        <span className="rounded-full bg-sunken px-3 py-1 text-xs font-medium text-ink-soft">
          {left} of {limit} checks left today
        </span>
      </header>

      <div className="max-w-xs">
        <Segmented
          label="What to check"
          value={mode}
          onChange={switchMode}
          options={[
            { value: "text", label: "Text" },
            { value: "image", label: "Image" },
          ]}
        />
      </div>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        {model ? (
          <span>
            Detection model: <strong className="text-ink-soft">{model}</strong>.{" "}
            {mode === "text" ? "Your text is sent to it for scoring." : "Your image is sent to it for scoring."} PanPen itself never stores what you check.
          </span>
        ) : (
          <span>
            {mode === "text"
              ? "No text-detection model is connected, so results show evidence but no likelihood score."
              : "No image-detection model is connected, so results rely on Content Credentials and metadata, with no likelihood score."}{" "}
            PanPen never stores what you check.
          </span>
        )}
      </p>

      {error && <Alert onClose={() => setError(null)}>{error}</Alert>}

      {mode === "text" ? (
        <Card className="p-3 sm:p-4">
          <label htmlFor="detect-text" className="sr-only">
            Text to check
          </label>
          <textarea
            id="detect-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (sealed) setSealed(null);
            }}
            placeholder="Paste the text you want to check (at least 100 words for a result)…"
            className={cx(inputClass, "min-h-[38vh] resize-y font-[inherit] leading-relaxed")}
            maxLength={DETECT_LIMITS.maxChars}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={cx("mr-auto text-xs", words > DETECT_LIMITS.maxWords ? "text-risk-high" : "text-muted")}>
              {words.toLocaleString()} words
              {words > 0 && words < DETECT_LIMITS.minWords && ` · at least ${DETECT_LIMITS.minWords} needed for a result`}
              {words > DETECT_LIMITS.maxWords && ` · maximum ${DETECT_LIMITS.maxWords.toLocaleString()}`}
            </span>
            <input
              ref={docRef}
              type="file"
              hidden
              accept=".docx,.pdf,.txt,.md,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,text/plain,text/markdown"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void uploadDoc(f);
              }}
            />
            <Button variant="secondary" size="sm" onClick={() => docRef.current?.click()} loading={uploading}>
              <FileUp className="size-4" /> Upload file
            </Button>
            {text && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setText("");
                  setSealed(null);
                }}
              >
                Clear
              </Button>
            )}
            <Button onClick={checkText} loading={busy} disabled={!text.trim() || words > DETECT_LIMITS.maxWords || left === 0}>
              <ScanSearch className="size-4" /> {busy ? "Checking…" : "Check text"}
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-3 sm:p-4">
          <input
            ref={imgRef}
            type="file"
            hidden
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.heic,.heif,.avif"
            onChange={(e) => {
              pickImage(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {!image ? (
            <button
              type="button"
              onClick={() => imgRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cx(
                "adinkra-dots flex min-h-[34vh] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
                dragging ? "border-forest bg-forest-soft" : "border-line-strong bg-surface hover:border-forest/60",
              )}
            >
              <span className="flex size-14 items-center justify-center rounded-2xl bg-forest-soft text-forest">
                <ImageUp className="size-7" />
              </span>
              <span>
                <span className="block text-base font-semibold text-ink">Upload an image to check</span>
                <span className="mt-1 block text-sm text-muted">Tap to choose · or drag it here · JPG, PNG, WebP, HEIC or AVIF up to {maxImageMb} MB</span>
              </span>
              <span className="max-w-md text-xs text-muted">Use the original file where possible: screenshots and social-media copies lose the Content Credentials and metadata PanPen checks.</span>
            </button>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-48 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-sunken sm:h-40 sm:w-56">
                {image.previewable ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                  <img src={image.url} alt="Selected image" className="max-h-full max-w-full object-contain" />
                ) : (
                  <ImageIcon className="size-10 text-muted" aria-label="No preview available" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="truncate text-sm font-semibold text-ink">{image.file.name}</p>
                  <p className="text-xs text-muted">{(image.file.size / 1024).toFixed(0)} KB · analysed exactly as uploaded, never stored</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={checkImage} loading={busy} disabled={left === 0}>
                    <ScanSearch className="size-4" /> {busy ? "Checking…" : "Check image"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setImage(null);
                      setSealed(null);
                    }}
                    disabled={busy}
                  >
                    Choose another
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {sealed && (
        <div ref={resultRef} className="scroll-mt-20 space-y-4" aria-live="polite">
          <VerdictCard result={sealed.result} />
          {sealed.result.kind === "text" ? <TextHighlights result={sealed.result} /> : <ImageDetails result={sealed.result} />}
          <EvidenceList evidence={sealed.result.evidence} />
          <ChecksAndLimits checks={sealed.result.checks} caveats={sealed.result.caveats} />
          <div className="flex flex-wrap gap-2">
            <Button variant="gold" onClick={downloadReport}>
              <FileDown className="size-4" /> Download report (.docx)
            </Button>
            <Button variant="secondary" onClick={downloadJson}>
              <Braces className="size-4" /> Data (.json)
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSealed(null);
                if (mode === "image") setImage(null);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <RotateCcw className="size-4" /> Check something else
            </Button>
          </div>
          <p className="text-xs text-muted">Report ID {sealed.result.id}. Reports are sealed by PanPen, so an edited result can&apos;t be turned into a PanPen report.</p>
        </div>
      )}
    </div>
  );
}

function VerdictCard({ result }: { result: DetectResult }) {
  const tone = TONE_STYLES[VERDICT_TONE[result.verdict]];
  const Icon = result.kind === "image" && result.basis === "content_credentials" && result.verdict !== "tampered" ? BadgeCheck : tone.icon;
  return (
    <Card className={cx("overflow-hidden border-2 p-5 sm:p-6", tone.card)}>
      <div className="flex items-start gap-4">
        <span className={cx("flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface shadow-sm", tone.text)}>
          <Icon className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cx("text-xs font-bold uppercase tracking-wider", tone.text)}>{VERDICT_LABEL[result.verdict]}</p>
          <h2 className="mt-0.5 font-serif text-2xl font-semibold leading-tight text-ink">{result.headline}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">{result.summary}</p>
        </div>
      </div>
      <div className="mt-5">
        {result.score ? (
          <ScoreMeter
            score={result.score}
            note={
              result.kind === "image" && (result.basis === "content_credentials" || result.basis === "metadata")
                ? `The result above rests on the image's ${result.basis === "content_credentials" ? "Content Credentials" : "metadata"}, which outrank this pixel-based estimate.`
                : undefined
            }
          />
        ) : (
          <NoScore kind={result.kind} />
        )}
      </div>
    </Card>
  );
}

function ScoreMeter({ score, note }: { score: ModelScore; note?: string }) {
  const mixed = score.mixed ?? 0;
  const human = score.human ?? Math.max(0, 1 - score.ai - mixed);
  return (
    <div className="rounded-xl bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          AI likelihood: <span className="text-2xl tabular-nums">{pct(score.ai)}</span>
        </p>
        <p className="text-xs text-muted">
          from {score.provider}
          {score.confidence ? ` · model confidence: ${score.confidence}` : ""}
        </p>
      </div>
      <div
        className="mt-3 flex h-3 overflow-hidden rounded-full bg-sunken"
        role="img"
        aria-label={`AI ${pct(score.ai)}${score.mixed !== null ? `, mixed ${pct(mixed)}` : ""}${score.human !== null ? `, human ${pct(human)}` : ""}`}
      >
        <div className="h-full bg-clay" style={{ width: `${score.ai * 100}%` }} />
        {score.mixed !== null && <div className="h-full bg-gold" style={{ width: `${mixed * 100}%` }} />}
        <div className="h-full bg-forest" style={{ width: `${(score.human !== null ? human : 1 - score.ai) * 100}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-clay" /> AI {pct(score.ai)}
        </span>
        {score.mixed !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-gold" /> Mixed {pct(mixed)}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-forest" /> {score.human !== null ? `Human ${pct(human)}` : `Not AI ${pct(1 - score.ai)}`}
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        {note ?? "This number comes from the detection model as-is. PanPen only calls a result when it is very high or very low; everything in between is Inconclusive."}
      </p>
    </div>
  );
}

function NoScore({ kind }: { kind: "text" | "image" }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-surface p-4 text-sm">
      <CircleHelp className="mt-0.5 size-4 shrink-0 text-muted" />
      <p className="text-ink-soft">
        <strong className="text-ink">No likelihood score.</strong>{" "}
        {kind === "text"
          ? "Scores only come from a detection model, and none produced one for this text. PanPen never makes up a percentage from writing patterns."
          : "Scores only come from a detection model, and none produced one for this image. Content Credentials and metadata are reported as evidence instead of being turned into a percentage."}
      </p>
    </div>
  );
}

/* ── Text highlights ────────────────────────────────────────────────── */

const HL_KINDS: { kind: HighlightKind; label: string; swatch: string }[] = [
  { kind: "model", label: "Model: likely AI sentence", swatch: "bg-clay-soft ring-1 ring-clay/40" },
  { kind: "artifact", label: "Chatbot wording", swatch: "bg-risk-high-bg ring-1 ring-risk-high/40" },
  { kind: "hidden", label: "Hidden character", swatch: "bg-gold-soft ring-1 ring-gold/50" },
  { kind: "phrase", label: "Stock phrase", swatch: "underline decoration-indigo decoration-dotted decoration-2" },
];

function segmentText(text: string, highlights: Highlight[], visible: Set<HighlightKind>) {
  const cover: Highlight[][] = Array.from({ length: text.length }, () => []);
  for (const h of highlights) {
    if (!visible.has(h.kind)) continue;
    for (let i = Math.max(0, h.start); i < Math.min(text.length, h.end); i++) cover[i]!.push(h);
  }
  const segs: { text: string; hs: Highlight[] }[] = [];
  let i = 0;
  while (i < text.length) {
    const key = cover[i]!;
    let j = i + 1;
    while (j < text.length && cover[j]!.length === key.length && cover[j]!.every((h, k) => h === key[k])) j++;
    segs.push({ text: text.slice(i, j), hs: key });
    i = j;
  }
  return segs;
}

function TextHighlights({ result }: { result: TextResult }) {
  const present = new Set(result.highlights.map((h) => h.kind));
  const [visible, setVisible] = useState<Set<HighlightKind>>(() => new Set(present));
  const [note, setNote] = useState<string | null>(null);
  const segs = useMemo(() => segmentText(result.text, result.highlights, visible), [result, visible]);
  const modelCount = result.highlights.filter((h) => h.kind === "model").length;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
          <FileText className="size-4 text-muted" /> Highlighted text
        </h3>
        <span className="text-xs text-muted">
          {result.words.toLocaleString()} words{result.score ? ` · ${modelCount} sentence${modelCount === 1 ? "" : "s"} flagged by the model` : ""}
        </span>
      </div>
      {present.size > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Show highlights">
          {HL_KINDS.filter((k) => present.has(k.kind)).map((k) => {
            const on = visible.has(k.kind);
            return (
              <button
                key={k.kind}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setVisible((v) => {
                    const n = new Set(v);
                    if (on) n.delete(k.kind);
                    else n.add(k.kind);
                    return n;
                  })
                }
                className={cx("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors", on ? "border-line-strong bg-surface text-ink" : "border-line text-muted opacity-60")}
              >
                <span className={cx("inline-block h-3 w-4 rounded-sm", k.swatch)} aria-hidden>
                  {k.kind === "phrase" ? "ab" : ""}
                </span>
                {k.label}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">Nothing to highlight in this text.</p>
      )}
      {note && (
        <p className="mt-3 rounded-lg bg-sunken px-3 py-2 text-xs text-ink-soft" role="status">
          {note}
        </p>
      )}
      <div className="mt-3 max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-canvas p-4 text-[15px] leading-relaxed text-ink">
        {segs.map((s, i) => {
          if (!s.hs.length) return <span key={i}>{s.text}</span>;
          const kinds = new Set(s.hs.map((h) => h.kind));
          const model = s.hs.find((h) => h.kind === "model");
          const label = s.hs.map((h) => h.note).join(" · ");
          const hidden = kinds.has("hidden");
          const shown = hidden ? s.text.replace(/[­᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, "◆") : s.text;
          return (
            <mark
              key={i}
              title={label}
              tabIndex={0}
              onClick={() => setNote(label)}
              onFocus={() => setNote(label)}
              className={cx(
                "cursor-help rounded-[3px] text-inherit outline-none focus-visible:ring-2 focus-visible:ring-forest",
                model ? ((model.ai ?? 0) >= 0.8 ? "bg-clay-soft ring-1 ring-clay/40" : "bg-clay-soft/60") : "bg-transparent",
                kinds.has("artifact") && "bg-risk-high-bg ring-1 ring-risk-high/40",
                hidden && "bg-gold-soft px-0.5 text-gold ring-1 ring-gold/50",
                kinds.has("phrase") && "underline decoration-indigo decoration-dotted decoration-2 underline-offset-4",
              )}
            >
              {shown}
            </mark>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted">Tap or hover a highlight to see why it was marked.</p>
    </Card>
  );
}

/* ── Image details ──────────────────────────────────────────────────── */

function ImageDetails({ result }: { result: ImageResult }) {
  const c = result.credentials;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-4 sm:p-5">
        <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
          {c && c.state !== "invalid" ? <ShieldCheck className="size-4 text-forest" /> : c ? <ShieldAlert className="size-4 text-risk-low" /> : <ShieldCheck className="size-4 text-muted" />}
          Content Credentials
        </h3>
        {c ? (
          <div className="mt-3 space-y-2 text-sm">
            <p className="font-medium text-ink">{c.state === "trusted" ? "Valid · trusted signer" : c.state === "valid" ? "Valid signature · signer not on the C2PA Trust List" : "Failed verification"}</p>
            <p className="text-ink-soft">{c.trustNote}</p>
            {c.failures.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-ink-soft">
                {c.failures.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">
            None found. That&apos;s normal for screenshots and images shared on social media or messaging apps, and it is not evidence the image is human-made.
          </p>
        )}
      </Card>
      <Card className="p-4 sm:p-5">
        <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
          <ImageIcon className="size-4 text-muted" /> File and metadata
        </h3>
        <dl className="mt-3 grid grid-cols-[minmax(0,40%)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
          {[["File", result.file.name] as [string, string], ["Size", `${(result.file.bytes / 1024).toFixed(0)} KB`] as [string, string], ...result.metadata].map(([k, v], i) => (
            <div key={`${k}-${i}`} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="break-words text-ink">{v}</dd>
            </div>
          ))}
          <dt className="text-muted">SHA-256</dt>
          <dd className="break-all font-mono text-[11px] text-ink-soft">{result.file.sha256}</dd>
        </dl>
      </Card>
    </div>
  );
}

/* ── Evidence, checks, limitations ─────────────────────────────────── */

const DIRECTION_TEXT: Record<Evidence["direction"], string> = { ai: "Points to AI", human: "Points to human", neutral: "Neither way", warning: "Integrity warning" };

function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="text-base font-semibold text-ink">Evidence</h3>
      {evidence.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No specific evidence was found either way.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {evidence.map((e) => {
            const tone = TONE_STYLES[e.direction];
            const Icon = e.direction === "warning" ? AlertTriangle : tone.icon;
            return (
              <li key={e.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <Icon className={cx("mt-0.5 size-4 shrink-0", tone.text)} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{e.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{e.detail}</p>
                  <p className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-medium">
                    <span className="rounded-full bg-sunken px-2 py-0.5 text-ink-soft">{e.source}</span>
                    <span className={cx("rounded-full px-2 py-0.5", tone.card, tone.text)}>{DIRECTION_TEXT[e.direction]}</span>
                    {e.strength !== "info" && <span className="rounded-full bg-sunken px-2 py-0.5 text-ink-soft">{e.strength[0]!.toUpperCase() + e.strength.slice(1)} evidence</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const CHECK_TEXT: Record<CheckStatus["status"], string> = { ok: "Done", none_found: "Nothing found", skipped: "Not checked", not_configured: "Not set up", error: "Failed" };

function ChecksAndLimits({ checks, caveats }: { checks: CheckStatus[]; caveats: string[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-4 sm:p-5">
        <h3 className="text-base font-semibold text-ink">Checks performed</h3>
        <ul className="mt-3 space-y-2.5">
          {checks.map((c) => (
            <li key={c.name} className="text-sm">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{c.name}</span>
                <span
                  className={cx(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    c.status === "ok" ? "bg-forest-soft text-forest" : c.status === "error" ? "bg-risk-high-bg text-risk-high" : "bg-sunken text-ink-soft",
                  )}
                >
                  {CHECK_TEXT[c.status]}
                </span>
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">{c.message}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-4 sm:p-5">
        <h3 className="text-base font-semibold text-ink">Read this before acting on a result</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-soft">
          {caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
