"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Download, FileText } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { ApiError, downloadBlob, slug, toApiError } from "@/lib/client";
import { chosenText, type ClientSegment } from "./types";

export function ExportMenu({ title, segments, disabled }: { title: string; segments: ClientSegment[]; disabled?: boolean }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const finalText = segments.map(chosenText).map((t) => t.trim()).filter(Boolean).join("\n\n");
  const name = title.trim() || "Preader document";

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(finalText);
      toast("Copied your final text.");
    } catch {
      toast("Couldn't access the clipboard. Select the text in the Final tab instead.", "high");
    }
  }

  async function docx(format: "docx" | "report") {
    setBusy(format);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          format,
          title: name,
          text: finalText,
          segments:
            format === "report"
              ? segments.map((s) => ({
                  original: s.original,
                  final: chosenText(s),
                  risk: s.risk,
                  notes: [...s.flags.map((f) => f.message), ...(s.changes && s.kind === "text" ? [`Edit: ${s.changes}`] : [])].slice(0, 20),
                }))
              : undefined,
        }),
      });
      if (!res.ok) throw await toApiError(res);
      downloadBlob(await res.blob(), `${slug(name)}${format === "report" ? "-revision-report" : ""}.docx`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Export failed. Please try again.", "high");
    } finally {
      setBusy(null);
      setOpen(false);
    }
  }

  function plain(ext: "txt" | "md") {
    const body = ext === "md" ? `# ${name}\n\n${finalText}\n` : `${name}\n\n${finalText}\n`;
    downloadBlob(new Blob([body], { type: ext === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8" }), `${slug(name)}.${ext}`);
    setOpen(false);
  }

  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-sunken disabled:opacity-50";

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={copy} disabled={disabled || !finalText}>
        <Copy className="size-4" /> <span className="hidden sm:inline">Copy</span>
      </Button>
      <div className="relative" ref={ref}>
        <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)} disabled={disabled || !finalText} aria-haspopup="menu" aria-expanded={open}>
          <Download className="size-4" /> <span className="hidden sm:inline">Export</span>
        </Button>
        {open && (
          <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
            <button role="menuitem" className={item} onClick={() => docx("docx")} disabled={!!busy}>
              <FileText className="size-4 text-forest" /> Word document (.docx)
            </button>
            <button role="menuitem" className={item} onClick={() => plain("md")}>
              <FileText className="size-4 text-muted" /> Markdown (.md)
            </button>
            <button role="menuitem" className={item} onClick={() => plain("txt")}>
              <FileText className="size-4 text-muted" /> Plain text (.txt)
            </button>
            <div className="my-1 h-px bg-line" />
            <button role="menuitem" className={item} onClick={() => docx("report")} disabled={!!busy}>
              <FileText className="size-4 text-gold" />
              <span>
                Revision report (.docx)
                <span className="block text-xs text-muted">Side-by-side changes and flags</span>
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
