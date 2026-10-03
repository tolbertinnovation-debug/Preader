"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Download, ImagePlus, Info, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button, Card, Label, Segmented, cx, inputClass, useToast } from "@/components/ui";
import { downloadBlob, slug } from "@/lib/client";
import {
  DEFAULT_DESIGN,
  FORMATS,
  MAX_BULLETS,
  MAX_ITEMS,
  TEMPLATES,
  TEMPLATE_FIELDS,
  THEMES,
  sanitizeDesign,
  type Design,
  type FormatId,
  type TemplateId,
} from "@/lib/design/templates";
import { renderDesign, type Assets, type Fonts } from "./render";

const STORAGE_KEY = "panpen:design";
const MAX_IMAGE_EDGE = 3000;

function loadSaved(): Design {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeDesign(JSON.parse(raw)) : DEFAULT_DESIGN;
  } catch {
    return DEFAULT_DESIGN;
  }
}

/** Decodes an image on the device (respecting camera rotation) and caps its size to keep memory low. */
async function decode(file: File): Promise<ImageBitmap> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bmp.width, bmp.height));
  if (scale === 1) return bmp;
  const out = await createImageBitmap(bmp, {
    resizeWidth: Math.round(bmp.width * scale),
    resizeHeight: Math.round(bmp.height * scale),
    resizeQuality: "high",
  });
  bmp.close();
  return out;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <Label hint={hint}>{label}</Label>
      {children}
    </div>
  );
}

export function FlyerMaker() {
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [design, setDesign] = useState<Design>(DEFAULT_DESIGN);
  const [loaded, setLoaded] = useState(false);
  const [fonts, setFonts] = useState<Fonts | null>(null);
  const [assets, setAssets] = useState<Assets>({ logo: null, photo: null });
  const [busy, setBusy] = useState<"png" | "jpg" | null>(null);

  // Restore the last design (text only) and load the brand fonts before drawing.
  useEffect(() => {
    const saved = loadSaved();
    const root = getComputedStyle(document.documentElement);
    const sans = root.getPropertyValue("--font-inter").trim() || "system-ui, sans-serif";
    const serif = root.getPropertyValue("--font-fraunces").trim() || "Georgia, serif";
    Promise.all(
      ["500", "600", "700", "800", "900"].map((w) => document.fonts.load(`${w} 40px ${sans}`)).concat(document.fonts.load(`700 40px ${serif}`)),
    )
      .catch(() => {})
      .finally(() => {
        setDesign(saved);
        setFonts({ sans, serif });
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(design));
      } catch {
        /* storage unavailable */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [design, loaded]);

  useEffect(() => {
    if (!fonts || !canvasRef.current) return;
    const frame = requestAnimationFrame(() => canvasRef.current && renderDesign(canvasRef.current, design, assets, fonts));
    return () => cancelAnimationFrame(frame);
  }, [design, assets, fonts]);

  const set = <K extends keyof Design>(k: K, v: Design[K]) => setDesign((d) => ({ ...d, [k]: v }));
  const shows = (k: keyof Design) => TEMPLATE_FIELDS[design.template].includes(k);

  async function pickImage(kind: "logo" | "photo", file: File | undefined) {
    if (!file) return;
    try {
      const bmp = await decode(file);
      setAssets((a) => {
        a[kind]?.close();
        return { ...a, [kind]: bmp };
      });
    } catch {
      toast("We couldn't open that image. Please use a JPG, PNG or WebP file.", "high");
    }
  }

  function clearImage(kind: "logo" | "photo") {
    setAssets((a) => {
      a[kind]?.close();
      return { ...a, [kind]: null };
    });
  }

  async function exportAs(type: "png" | "jpg") {
    const canvas = canvasRef.current;
    if (!canvas || !fonts) return;
    setBusy(type);
    try {
      renderDesign(canvas, design, assets, fonts);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type === "png" ? "image/png" : "image/jpeg", 0.95));
      if (!blob) throw new Error("export failed");
      downloadBlob(blob, `${slug(design.headline || "design")}-${design.format}.${type}`);
    } catch {
      toast("Couldn't create the file. Please try again.", "high");
    } finally {
      setBusy(null);
    }
  }

  const fmt = FORMATS[design.format];

  return (
    <div className="mx-auto grid max-w-[1400px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      {/* Preview */}
      <section className="min-w-0 space-y-4 lg:sticky lg:top-[4.5rem] lg:self-start">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl font-semibold tracking-tight">Design</h1>
            <p className="mt-1 text-sm text-muted">Create flyers and posters from your own words, logo and photos — no AI generation.</p>
          </div>
          <span className="rounded-full bg-sunken px-3 py-1 text-xs font-medium text-ink-soft">
            {fmt.label} · {fmt.width}×{fmt.height}
          </span>
        </div>
        <Card className="p-3 sm:p-4">
          <div className="mx-auto flex justify-center" style={{ maxWidth: `min(100%, calc(70vh * ${fmt.width / fmt.height}))` }}>
            <canvas
              ref={canvasRef}
              width={fmt.width}
              height={fmt.height}
              aria-label="Design preview"
              role="img"
              className={cx("h-auto w-full rounded-xl shadow-sm ring-1 ring-line transition-opacity", !fonts && "opacity-0")}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => exportAs("png")} loading={busy === "png"} disabled={!fonts}>
              {busy !== "png" && <Download className="size-4" />} Download PNG
            </Button>
            <Button variant="secondary" onClick={() => exportAs("jpg")} loading={busy === "jpg"} disabled={!fonts}>
              {busy !== "jpg" && <Download className="size-4" />} JPG (smaller)
            </Button>
          </div>
        </Card>
        <div className="flex gap-2 rounded-2xl border border-line bg-surface p-4 text-xs leading-relaxed text-ink-soft">
          <Info className="mt-0.5 size-4 shrink-0 text-forest" />
          <p>
            Designs are drawn on your device from your own text and images. Nothing is AI-generated and nothing is uploaded, so there is no AI
            label to remove. If you add a photo that was itself made with AI, platforms may still recognise that photo.
          </p>
        </div>
      </section>

      {/* Controls */}
      <aside className="space-y-5">
        <Card className="space-y-5 p-5">
          <Field label="Template">
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Template">
              {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={design.template === id}
                  onClick={() => set("template", id)}
                  className={cx(
                    "rounded-xl border px-2 py-2.5 text-center transition-all",
                    design.template === id ? "border-forest bg-forest-soft text-forest" : "border-line bg-surface text-muted hover:text-ink",
                  )}
                >
                  <span className="block text-[13px] font-semibold">{TEMPLATES[id].label}</span>
                  <span className="mt-0.5 block text-[10px] leading-tight opacity-80">{TEMPLATES[id].hint}</span>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Size" hint={fmt.hint}>
            <select value={design.format} onChange={(e) => set("format", e.target.value as FormatId)} className={inputClass} aria-label="Size">
              {(Object.keys(FORMATS) as FormatId[]).map((id) => (
                <option key={id} value={id}>
                  {FORMATS[id].label} — {FORMATS[id].hint}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Colours">
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Colours">
              {Object.entries(THEMES).map(([id, th]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={design.theme === id}
                  onClick={() => set("theme", id)}
                  className={cx(
                    "flex flex-col items-center gap-1.5 rounded-xl border p-2 text-[11px] font-semibold transition-all",
                    design.theme === id ? "border-forest ring-2 ring-forest/25" : "border-line hover:border-line-strong",
                  )}
                >
                  <span className="flex h-6 w-full overflow-hidden rounded-md ring-1 ring-black/10">
                    <span className="flex-1" style={{ background: th.primary }} />
                    <span className="flex-1" style={{ background: th.accent }} />
                    <span className="flex-1" style={{ background: th.bg }} />
                  </span>
                  {th.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Headline style">
            <Segmented
              label="Headline style"
              value={design.headlineFont}
              onChange={(v) => set("headlineFont", v)}
              options={[
                { value: "sans", label: "Bold" },
                { value: "serif", label: "Elegant" },
              ]}
            />
          </Field>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">Logo & photo</h2>
          <div className="grid grid-cols-2 gap-3">
            {(["logo", "photo"] as const).map((kind) => (
              <div key={kind}>
                <Label>{kind === "logo" ? "Logo" : "Photo"}</Label>
                {assets[kind] ? (
                  <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
                    <span className="flex-1 truncate text-forest">Added ✓</span>
                    <button type="button" onClick={() => clearImage(kind)} className="text-muted hover:text-ink" aria-label={`Remove ${kind}`}>
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface px-3 py-2 text-sm font-medium text-ink-soft hover:border-forest">
                    <ImagePlus className="size-4" /> Add
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/*"
                      className="sr-only"
                      aria-label={`Add ${kind}`}
                      onChange={(e) => {
                        void pickImage(kind, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">
            {design.template === "event" ? "The photo fills the top of the event poster." : "Photos appear on taller sizes (portrait, story, A4)."} Images stay on your
            device.
          </p>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">Text</h2>
          {shows("brand") && (
            <Field label="Organisation name">
              <input value={design.brand} maxLength={80} onChange={(e) => set("brand", e.target.value)} className={inputClass} />
            </Field>
          )}
          <Field label="Headline">
            <input value={design.headline} maxLength={120} onChange={(e) => set("headline", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Subheadline">
            <input value={design.subheadline} maxLength={160} onChange={(e) => set("subheadline", e.target.value)} className={inputClass} />
          </Field>
          {shows("badge") && (
            <Field label="Badge" hint="e.g. 50% OFF, NEW">
              <input value={design.badge} maxLength={16} onChange={(e) => set("badge", e.target.value)} className={inputClass} />
            </Field>
          )}
          {shows("date") && (
            <Field label="Date & time">
              <input value={design.date} maxLength={80} onChange={(e) => set("date", e.target.value)} className={inputClass} />
            </Field>
          )}
          {shows("venue") && (
            <Field label="Venue">
              <input value={design.venue} maxLength={100} onChange={(e) => set("venue", e.target.value)} className={inputClass} />
            </Field>
          )}
          {shows("body") && (
            <Field label="Details">
              <textarea value={design.body} maxLength={400} rows={3} onChange={(e) => set("body", e.target.value)} className={inputClass} />
            </Field>
          )}
        </Card>

        {shows("items") && (
          <Card className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Packages & prices</h2>
              <span className="text-xs text-muted">
                {design.items.length}/{MAX_ITEMS}
              </span>
            </div>
            {design.items.map((it, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-line bg-sunken/40 p-3">
                <div className="flex gap-2">
                  <input
                    value={it.title}
                    maxLength={60}
                    placeholder="Package name"
                    aria-label={`Package ${i + 1} name`}
                    onChange={(e) => set("items", design.items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                    className={cx(inputClass, "flex-1")}
                  />
                  <button
                    type="button"
                    onClick={() => set("items", design.items.filter((_, j) => j !== i))}
                    className="rounded-lg px-2 text-muted hover:bg-surface hover:text-risk-high"
                    aria-label={`Remove package ${i + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={it.oldPrice}
                    maxLength={16}
                    placeholder="Was (optional)"
                    aria-label={`Package ${i + 1} old price`}
                    onChange={(e) => set("items", design.items.map((x, j) => (j === i ? { ...x, oldPrice: e.target.value } : x)))}
                    className={inputClass}
                  />
                  <input
                    value={it.price}
                    maxLength={16}
                    placeholder="Price"
                    aria-label={`Package ${i + 1} price`}
                    onChange={(e) => set("items", design.items.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                    className={inputClass}
                  />
                </div>
                <input
                  value={it.note}
                  maxLength={80}
                  placeholder="Short note (optional)"
                  aria-label={`Package ${i + 1} note`}
                  onChange={(e) => set("items", design.items.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
                  className={inputClass}
                />
              </div>
            ))}
            {design.items.length < MAX_ITEMS && (
              <Button variant="secondary" size="sm" onClick={() => set("items", [...design.items, { title: "", oldPrice: "", price: "", note: "" }])}>
                <Plus className="size-4" /> Add package
              </Button>
            )}
          </Card>
        )}

        {shows("bullets") && (
          <Card className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Highlights</h2>
              <span className="text-xs text-muted">
                {design.bullets.length}/{MAX_BULLETS}
              </span>
            </div>
            {design.bullets.map((b, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={b}
                  maxLength={80}
                  aria-label={`Highlight ${i + 1}`}
                  onChange={(e) => set("bullets", design.bullets.map((x, j) => (j === i ? e.target.value : x)))}
                  className={cx(inputClass, "flex-1")}
                />
                <button
                  type="button"
                  onClick={() => set("bullets", design.bullets.filter((_, j) => j !== i))}
                  className="rounded-lg px-2 text-muted hover:bg-sunken hover:text-risk-high"
                  aria-label={`Remove highlight ${i + 1}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            {design.bullets.length < MAX_BULLETS && (
              <Button variant="secondary" size="sm" onClick={() => set("bullets", [...design.bullets, ""])}>
                <Plus className="size-4" /> Add highlight
              </Button>
            )}
          </Card>
        )}

        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">Call to action & contact</h2>
          <Field label="Button text" hint="Leave empty to hide">
            <input value={design.cta} maxLength={40} onChange={(e) => set("cta", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Phone / WhatsApp">
            <input value={design.phone} maxLength={40} inputMode="tel" onChange={(e) => set("phone", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Email">
            <input value={design.email} maxLength={80} inputMode="email" onChange={(e) => set("email", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Website">
            <input value={design.website} maxLength={80} inputMode="url" onChange={(e) => set("website", e.target.value)} className={inputClass} />
          </Field>
          <p className="text-xs text-muted">Double-check every number and address — they print exactly as typed.</p>
        </Card>

        <button
          type="button"
          onClick={() => {
            setDesign(DEFAULT_DESIGN);
            clearImage("logo");
            clearImage("photo");
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink"
        >
          <RotateCcw className="size-3.5" /> Start over with the example
        </button>
      </aside>
    </div>
  );
}
