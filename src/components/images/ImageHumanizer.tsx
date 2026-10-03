"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Columns2, Download, Hand, ImageUp, Info, Landmark, Newspaper, Package, RefreshCw, ScanFace, ShieldCheck, Sparkles, Split, Square, Sun, UserRound, WandSparkles, X } from "lucide-react";
import { Alert, Button, Card, Label, Segmented, cx, useToast } from "@/components/ui";
import { ApiError, downloadBlob, toApiError } from "@/lib/client";
import {
  DEFAULT_IMAGE_OPTIONS,
  IMAGE_FOCUS,
  IMAGE_LIMITS,
  IMAGE_STRENGTHS,
  IMAGE_SUBJECTS,
  type ImageFocus,
  type ImageSubject,
  type ImageOptions,
  type ImageStrength,
} from "@/lib/images/options";
import { CompareSlider } from "./CompareSlider";

type Picture = { url: string; blob: Blob; width: number; height: number; name: string };
type View = "slider" | "side" | "before" | "after";

const FOCUS_ICONS: Record<ImageFocus, typeof Sparkles> = { skin: ScanFace, lighting: Sun, anatomy: Hand, artifacts: Sparkles };
const SUBJECT_ICONS: Record<ImageSubject, typeof Sparkles> = { people: UserRound, product: Package, scene: Landmark, graphic: Newspaper };
const STAGES = ["Studying light and skin tones…", "Refining natural skin texture…", "Checking hands, eyes and details…", "Removing AI artefacts…", "Final photographic polish…"];

/**
 * Decodes the file (respecting phone camera rotation), scales it to the editing size and
 * re-encodes it as JPEG. Re-encoding also strips EXIF metadata such as GPS location.
 */
async function prepare(file: File): Promise<Picture> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("We couldn't open that image. Please use a JPG, PNG or WebP file.");
  }
  const scale = Math.min(1, IMAGE_LIMITS.maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  if (Math.min(width, height) < 64) throw new Error("That image is too small to enhance.");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; // flatten transparency
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let quality = 0.93;
  let blob: Blob | null = null;
  while (quality >= 0.6) {
    blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (blob && blob.size <= IMAGE_LIMITS.maxUploadBytes - 100_000) break;
    quality -= 0.08;
  }
  if (!blob) throw new Error("We couldn't prepare that image. Please try another one.");
  return { url: URL.createObjectURL(blob), blob, width, height, name: file.name.replace(/\.[^.]+$/, "") || "image" };
}

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function ImageHumanizer({ used, limit }: { used: number; limit: number }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [original, setOriginal] = useState<Picture | null>(null);
  const [result, setResult] = useState<{ url: string; blob: Blob } | null>(null);
  const [options, setOptions] = useState<ImageOptions>(DEFAULT_IMAGE_OPTIONS);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("slider");
  const [dragging, setDragging] = useState(false);
  const [usedToday, setUsedToday] = useState(used);

  // Release object URLs when pictures are replaced or the page unmounts.
  useEffect(() => {
    if (!original) return;
    return () => URL.revokeObjectURL(original.url);
  }, [original]);
  useEffect(() => {
    if (!result) return;
    return () => URL.revokeObjectURL(result.url);
  }, [result]);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const load = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast("Please choose an image file (JPG, PNG or WebP).", "high");
        return;
      }
      setPreparing(true);
      setError(null);
      try {
        const pic = await prepare(file);
        setResult(null);
        setOriginal(pic);
        setView("slider");
      } catch (err) {
        toast(err instanceof Error ? err.message : "We couldn't open that image.", "high");
      } finally {
        setPreparing(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [toast],
  );

  async function humanize() {
    if (!original || !consent || busy) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setElapsed(0);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("image", original.blob, `${original.name}.jpg`);
      fd.append("width", String(original.width));
      fd.append("height", String(original.height));
      fd.append("subject", options.subject);
      fd.append("strength", String(options.strength));
      fd.append("focus", options.focus.join(","));
      fd.append("consent", "true");
      const res = await fetch("/api/images/humanize", { method: "POST", body: fd, credentials: "same-origin", signal: ctrl.signal });
      if (!res.ok) throw await toApiError(res);
      const blob = await res.blob();
      setResult({ url: URL.createObjectURL(blob), blob });
      setUsedToday((n) => n + 1);
      setView("slider");
    } catch (err) {
      if (ctrl.signal.aborted) setError("Stopped. Your image wasn't counted against today's limit.");
      else setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function download() {
    if (!result || !original) return;
    downloadBlob(result.blob, `panpen-${original.name.slice(0, 40)}-humanized-${stamp()}.jpg`);
  }

  function reset() {
    setOriginal(null);
    setResult(null);
    setError(null);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) void load(f);
  }

  const toggleFocus = (f: ImageFocus) =>
    setOptions((o) => {
      const next = o.focus.includes(f) ? o.focus.filter((x) => x !== f) : [...o.focus, f];
      return { ...o, focus: next.length ? next : o.focus };
    });

  const left = Math.max(0, limit - usedToday);
  const stage = STAGES[Math.min(STAGES.length - 1, Math.floor(elapsed / 12))];

  return (
    <div className="mx-auto grid max-w-[1400px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* Canvas */}
      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl font-semibold tracking-tight">Image Humanizer</h1>
            <p className="mt-1 text-sm text-muted">Make AI-generated images look more natural — keeping the people, products and details that matter.</p>
          </div>
          <span className="rounded-full bg-sunken px-3 py-1 text-xs font-medium text-ink-soft">
            {left} of {limit} images left today
          </span>
        </div>

        {error && (
          <Alert onClose={() => setError(null)} tone={error.startsWith("Stopped") ? "medium" : "high"}>
            {error}
          </Alert>
        )}

        {!original ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            disabled={preparing}
            className={cx(
              "adinkra-dots flex min-h-[48vh] w-full flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-6 py-12 text-center transition-colors",
              dragging ? "border-forest bg-forest-soft" : "border-line-strong bg-surface hover:border-forest/60",
            )}
          >
            <span className="flex size-16 items-center justify-center rounded-2xl bg-forest-soft text-forest">
              <ImageUp className="size-8" />
            </span>
            <span>
              <span className="block text-lg font-semibold text-ink">{preparing ? "Preparing your image…" : "Upload an AI-generated image"}</span>
              <span className="mt-1 block text-sm text-muted">Tap to choose or take a photo · or drag it here · JPG, PNG or WebP</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <ShieldCheck className="size-3.5 text-forest" /> Location data is removed and images are never stored.
            </span>
          </button>
        ) : (
          <Card className="p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {result ? (
                <div role="tablist" aria-label="Comparison view" className="inline-flex rounded-xl bg-sunken p-1">
                  {(
                    [
                      ["slider", "Slider", Split],
                      ["side", "Side by side", Columns2],
                      ["before", "Before", Square],
                      ["after", "After", Sparkles],
                    ] as const
                  ).map(([id, label, Icon]) => (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={view === id}
                      onClick={() => setView(id)}
                      className={cx(
                        "items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all",
                        id === "side" ? "hidden sm:inline-flex" : "inline-flex",
                        view === id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
                      )}
                    >
                      <Icon className="size-3.5" /> {label}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-sm font-medium text-ink-soft">Original · {original.width}×{original.height}</span>
              )}
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
                  <X className="size-4" /> <span className="hidden sm:inline">New image</span>
                </Button>
                {result && (
                  <Button size="sm" onClick={download}>
                    <Download className="size-4" /> Download
                  </Button>
                )}
              </div>
            </div>

            <div className="relative">
              {result && view === "slider" && <CompareSlider before={original.url} after={result.url} width={original.width} height={original.height} />}
              {result && view === "side" && (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["Before", original.url],
                    ["After", result.url],
                  ].map(([label, url]) => (
                    <figure key={label} className="space-y-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element -- local blob: URLs */}
                      <img src={url} alt={label} className="w-full rounded-xl bg-sunken object-contain" />
                      <figcaption className="text-center text-xs font-semibold text-muted">{label}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
              {(!result || view === "before" || view === "after") && (
                // eslint-disable-next-line @next/next/no-img-element -- local blob: URLs
                <img
                  src={result && view === "after" ? result.url : original.url}
                  alt={result && view === "after" ? "Humanized result" : "Original upload"}
                  className={cx("mx-auto max-h-[72vh] w-auto rounded-2xl bg-sunken object-contain transition", busy && "scale-[0.99] opacity-60 blur-[1px]")}
                />
              )}
              {busy && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl bg-canvas/40 p-6 text-center backdrop-blur-[2px]">
                  <div className="kente h-2 w-48 animate-pulse rounded-full" />
                  <p className="font-serif text-lg font-semibold text-ink">{stage}</p>
                  <p className="text-xs text-ink-soft">{elapsed}s · high-quality edits usually take 30–90 seconds</p>
                  <Button variant="secondary" size="sm" onClick={() => abortRef.current?.abort()}>
                    Stop
                  </Button>
                </div>
              )}
            </div>
            {result && (
              <p className="mt-3 text-center text-xs text-muted">
                Full-resolution JPEG, 95% quality. The file keeps its Content Credentials, so platforms may still show an AI label.
              </p>
            )}
          </Card>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          hidden
          onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])}
        />
      </section>

      {/* Controls */}
      <aside className="space-y-5 lg:sticky lg:top-[4.5rem] lg:self-start">
        <Card className="space-y-5 p-5">
          <div>
            <Label>What&apos;s in the image?</Label>
            <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Image subject">
              {(Object.keys(IMAGE_SUBJECTS) as ImageSubject[]).map((s) => {
                const Icon = SUBJECT_ICONS[s];
                const on = options.subject === s;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    title={IMAGE_SUBJECTS[s].hint}
                    onClick={() => setOptions((o) => ({ ...o, subject: s }))}
                    className={cx(
                      "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] font-semibold transition-all",
                      on ? "border-forest bg-forest-soft text-forest" : "border-line bg-surface text-muted hover:text-ink",
                    )}
                  >
                    <Icon className="size-4" /> {IMAGE_SUBJECTS[s].label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">{IMAGE_SUBJECTS[options.subject].hint}</p>
          </div>

          <div>
            <Label hint={IMAGE_STRENGTHS[options.strength].label}>Enhancement strength</Label>
            <Segmented
              label="Enhancement strength"
              value={options.strength}
              onChange={(v) => setOptions((o) => ({ ...o, strength: v }))}
              options={([1, 2, 3] as ImageStrength[]).map((k) => ({ value: k, label: IMAGE_STRENGTHS[k].label, title: IMAGE_STRENGTHS[k].hint }))}
            />
            <p className="mt-2 text-xs text-muted">{IMAGE_STRENGTHS[options.strength].hint}</p>
          </div>

          <div>
            <Label>Improve</Label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(IMAGE_FOCUS) as ImageFocus[]).map((f) => {
                const Icon = FOCUS_ICONS[f];
                const on = options.focus.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={on}
                    title={IMAGE_FOCUS[f].hint}
                    onClick={() => toggleFocus(f)}
                    className={cx(
                      "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] font-semibold transition-all",
                      on ? "border-forest bg-forest-soft text-forest" : "border-line bg-surface text-muted hover:text-ink",
                    )}
                  >
                    <Icon className="size-4 shrink-0" /> {IMAGE_FOCUS[f].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl bg-gold-soft/60 p-3 text-xs leading-relaxed text-ink-soft">
            <strong className="text-ink">Always preserved:</strong>{" "}
            {options.subject === "graphic"
              ? "every word, price and contact detail, logos, layout and colours — and any people exactly as they are."
              : options.subject === "product"
                ? "the product's shape, colours and branding — and any people exactly as they are."
                : options.subject === "scene"
                  ? "the layout, buildings and landmarks — and any people exactly as they are."
                  : "identity and facial features, skin tone (never lightened), hair texture, African features, pose, clothing and composition."}
          </div>

          <label className="flex cursor-pointer items-start gap-3 text-xs leading-relaxed text-ink-soft">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-forest)]"
            />
            <span>
              I have the right to edit this image, anyone identifiable in it has agreed, and I won&apos;t use the result to deceive or impersonate
              anyone.
            </span>
          </label>

          <Button size="lg" className="w-full" onClick={humanize} disabled={!original || !consent || busy || left === 0} loading={busy}>
            {!busy && (result ? <RefreshCw className="size-4" /> : <WandSparkles className="size-4" />)}
            {busy ? "Humanizing…" : result ? "Humanize again" : "Humanize image"}
          </Button>
          {!original && <p className="-mt-2 text-center text-xs text-muted">Upload an image to begin.</p>}
          {left === 0 && <p className="-mt-2 text-center text-xs text-risk-high">You&apos;ve used all of today&apos;s images.</p>}
        </Card>
        <div className="rounded-2xl border border-line bg-surface p-4 text-xs leading-relaxed text-ink-soft">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Info className="size-4 text-forest" /> What to expect
          </p>
          <ul className="list-disc space-y-1.5 pl-4">
            <li>PanPen improves how an image looks: texture, light, anatomy and visible AI flaws. Results vary, and some images improve more than others.</li>
            <li>
              It does <strong className="text-ink">not</strong> hide that AI was used. Results keep their Content Credentials, and Facebook, Instagram and
              other platforms may still label them as AI-made.
            </li>
            <li>Always check faces, hands and any text before you share or print.</li>
            <li>Images are sent securely to OpenAI for editing and are never stored by PanPen. Nudity, violence and impersonation are refused.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
