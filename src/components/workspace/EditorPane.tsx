"use client";

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { FileText, Upload } from "lucide-react";
import { Badge, Button, cx, useToast } from "@/components/ui";
import { ApiError, toApiError } from "@/lib/client";
import { LIMITS } from "@/lib/options";
import { findCliches } from "@/lib/text/cliches";
import { analyze } from "@/lib/text/readability";
import { segmentDocument } from "@/lib/text/segment";
import { countWords, readingMinutes } from "@/lib/text/words";

const SAMPLE = `The Role of Mobile Money in Rural Livelihoods in Liberia

In today's fast-paced world, it is important to note that mobile money plays a crucial role in the financial inclusion of rural households. Furthermore, it serves as a testament to the transformative potential of digital technology in the realm of development (Kpadeh & Sirleaf, 2021).

This study utilized a mixed-methods approach in order to delve into the experiences of 120 smallholder farmers in Bong and Nimba counties. Moreover, the findings suggest that households using mobile money were 34% more likely to save regularly, although the effect may be partly explained by higher baseline incomes (Kollie, 2020).

Additionally, participants described how sending money to relatives in Monrovia had become faster and safer. As one farmer explained, "before, we used to send money with the taxi driver and pray it reached."

References

Kollie, J. (2020). Savings behaviour among Liberian farmers. Journal of West African Development, 8(2), 45–61.

Kpadeh, M., & Sirleaf, T. (2021). Digital finance and inclusion in post-conflict economies. Monrovia University Press.`;

export function EditorPane({
  text,
  title,
  onText,
  onTitle,
  maxWords,
  disabled,
}: {
  text: string;
  title: string;
  onText: (t: string) => void;
  onTitle: (t: string) => void;
  maxWords: number;
  disabled?: boolean;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const stats = useMemo(() => {
    const segs = segmentDocument(text);
    const editable = segs.filter((s) => s.kind === "text");
    const editableWords = editable.reduce((n, s) => n + countWords(s.text), 0);
    const cliches = findCliches(editable.map((s) => s.text).join("\n\n"));
    const counts = new Map<string, number>();
    for (const c of cliches) counts.set(c.phrase, (counts.get(c.phrase) ?? 0) + 1);
    return {
      words: countWords(text),
      chars: text.length,
      editableWords,
      preserved: segs.length - editable.length,
      analysis: analyze(editable.map((s) => s.text).join("\n\n")),
      cliches: [...counts.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [text]);

  async function upload(file: File) {
    if (file.size > LIMITS.maxUploadBytes) {
      toast("Files must be 5 MB or smaller.", "high");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/files/parse", { method: "POST", body: fd, credentials: "same-origin" });
      if (!res.ok) throw await toApiError(res);
      const data = (await res.json()) as { text: string; title: string; truncated: boolean };
      onText(data.text);
      if (!title) onTitle(data.title);
      toast(data.truncated ? "File loaded — it was long, so we trimmed the end." : `Loaded “${file.name}”.`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Upload failed. Please try again.", "high");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) void upload(f);
  }

  const over = stats.editableWords > maxWords;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          maxLength={200}
          placeholder="Untitled document"
          aria-label="Document title"
          className="min-w-0 flex-1 bg-transparent font-serif text-2xl font-semibold tracking-tight text-ink placeholder:text-muted/60 focus:outline-none"
        />
        <div className="flex gap-2">
          {!text && (
            <Button variant="ghost" size="sm" onClick={() => onText(SAMPLE)} disabled={disabled}>
              <FileText className="size-4" /> Try a sample
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={uploading} disabled={disabled}>
            {!uploading && <Upload className="size-4" />} Upload
          </Button>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept=".docx,.pdf,.txt,.md,.markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,text/plain,text/markdown"
            onChange={(e: ChangeEvent<HTMLInputElement>) => e.target.files?.[0] && void upload(e.target.files[0])}
          />
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cx(
          "relative rounded-2xl border bg-surface shadow-[var(--shadow-card)] transition-colors",
          dragging ? "border-forest ring-4 ring-forest/15" : "border-line",
        )}
      >
        <textarea
          value={text}
          onChange={(e) => onText(e.target.value)}
          disabled={disabled}
          maxLength={LIMITS.maxChars}
          spellCheck
          aria-label="Your draft"
          placeholder={"Paste your draft here, or drop a .docx, PDF or text file.\n\nSeparate paragraphs with a blank line. Headings and your reference list will be kept exactly as written."}
          className="prose-doc block min-h-[52vh] w-full resize-y rounded-2xl bg-transparent px-5 py-5 placeholder:font-sans placeholder:text-[15px] placeholder:text-muted/80 focus:outline-none sm:px-8 sm:py-7"
        />
        {dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-forest-soft/80 text-sm font-semibold text-forest">
            Drop to upload
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
        <span className={cx(over && "font-semibold text-risk-high")}>
          <strong className="text-ink">{stats.words.toLocaleString()}</strong> words
          {stats.preserved > 0 && <> · {stats.editableWords.toLocaleString()} to rewrite</>}
          {over && <> (limit {maxWords.toLocaleString()} per run)</>}
        </span>
        <span>{stats.chars.toLocaleString()} characters</span>
        {stats.words > 0 && <span>~{readingMinutes(stats.words)} min read</span>}
        {stats.preserved > 0 && <span>{stats.preserved} heading/reference blocks kept verbatim</span>}
        {stats.analysis.words > 0 && (
          <>
            <span>Grade {stats.analysis.gradeLevel}</span>
            <span>Rhythm variety {stats.analysis.rhythmVariety}</span>
          </>
        )}
      </div>

      {stats.cliches.length > 0 && (
        <div className="rounded-2xl border border-gold/30 bg-gold-soft/50 p-4">
          <div className="mb-2 text-sm font-semibold text-ink">
            {stats.cliches.reduce((n, [, c]) => n + c, 0)} robotic or overused patterns found
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stats.cliches.slice(0, 14).map(([p, n]) => (
              <Badge key={p} tone="gold">
                {p.replace(/,$/, "")}
                {n > 1 && <span className="opacity-70">×{n}</span>}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
