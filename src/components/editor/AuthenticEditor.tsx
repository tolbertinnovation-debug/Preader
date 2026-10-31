"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Clipboard, Download, MessageCircle, Sparkles } from "lucide-react";
import { Alert, Button, Card, inputClass, Label, Switch, useToast } from "@/components/ui";
import { api, downloadBlob } from "@/lib/client";
import { EDITOR_TONES, type EditorRequest, type EditorResult } from "@/lib/editor/review";
import { countWords } from "@/lib/text/words";

export function AuthenticEditor({ hasVoiceSample, maxWords }: { hasVoiceSample: boolean; maxWords: number }) {
  const [text, setText] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState<EditorRequest["tone"]>("conversational");
  const [authorDetails, setAuthorDetails] = useState("");
  const [useVoiceSample, setUseVoiceSample] = useState(false);
  const [result, setResult] = useState<EditorResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const words = countWords(text);

  function changeInput(update: () => void) {
    update();
    setResult(null);
    setError(null);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api<EditorResult>("/api/editor", { body: { text, audience, tone, authorDetails, useVoiceSample } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not review your writing. Please try again.");
    } finally { setBusy(false); }
  }

  async function copyRevision() {
    try {
      await navigator.clipboard.writeText(result?.revision ?? "");
      toast("Revised writing copied.");
    } catch { toast("Could not copy. Select the revised text and copy it manually.", "high"); }
  }

  function downloadReport() {
    if (!result?.revision) return;
    const report = [
      "PanPen — Authentic Writing Review", `Audience: ${audience}`, `Tone: ${tone}`,
      "Three specific weaknesses", ...result.assessment.weaknesses.map((w, i) => `${i + 1}. ${w.issue}\nExcerpt: ${w.evidence}\n${w.explanation}`),
      "A. Revised version", result.revision, "B. Most important improvements", result.improvements,
      "C. Three suggestions for your voice", ...result.suggestions.map((s, i) => `${i + 1}. ${s}`),
      ...result.segments.filter((s) => s.flags.length).map((s) => `Review note: ${s.flags.map((f) => f.message).join(" ")}`),
      "Powered by Tolbert Innovation Hub (tolbertinnovationhub.org)",
    ].join("\n\n");
    downloadBlob(new Blob([report], { type: "text/plain;charset=utf-8" }), "PanPen-Writing-Review.txt");
  }

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <div className="mb-7 max-w-3xl">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-forest"><Sparkles className="size-4" aria-hidden /> Your ideas. Your voice.</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Authentic Writing Editor</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">Improve your writing for the people you want to reach. Get three specific weaknesses, a clear revision, and practical feedback that keeps your meaning and personality.</p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="p-5 sm:p-6">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <Label htmlFor="editor-text" hint={`${words.toLocaleString()} / ${maxWords.toLocaleString()} words`}>Your writing</Label>
              <textarea id="editor-text" required maxLength={60000} disabled={busy} value={text}
                onChange={(e) => changeInput(() => setText(e.target.value))}
                placeholder="Paste the writing you want to improve…" className={`${inputClass} min-h-72 resize-y leading-relaxed`} />
            </div>
            <div>
              <Label htmlFor="editor-audience">Intended audience</Label>
              <input id="editor-audience" required maxLength={500} disabled={busy} value={audience}
                onChange={(e) => changeInput(() => setAudience(e.target.value))} placeholder="For example: fellowship reviewers or my students" className={inputClass} />
            </div>
            <div>
              <Label htmlFor="editor-tone">Tone you want</Label>
              <select id="editor-tone" disabled={busy} value={tone} onChange={(e) => changeInput(() => setTone(e.target.value as EditorRequest["tone"]))} className={inputClass}>
                {EDITOR_TONES.map((t) => <option key={t} value={t}>{t[0]!.toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <Switch id="editor-voice" checked={useVoiceSample} disabled={busy || !hasVoiceSample}
              onChange={(v) => changeInput(() => setUseVoiceSample(v))} label="Match my saved writing sample"
              description="Your distinctive words, rhythm and expressions guide the edit." />
            {!hasVoiceSample && <p className="text-xs text-muted">Add your own writing sample in <Link className="text-forest underline" href="/app/settings">Settings</Link>. The editor can also learn from this draft.</p>}
            {result?.assessment.questions.length ? (
              <div className="rounded-xl border border-gold/40 bg-gold-soft p-4">
                <h2 className="flex items-center gap-2 font-semibold text-ink"><MessageCircle className="size-4" aria-hidden /> A little more detail from you</h2>
                <p className="mt-2 text-sm text-ink-soft">Answer these questions so the editor can preserve your meaning without guessing.</p>
                <ol className="my-3 list-decimal space-y-2 pl-5 text-sm text-ink-soft">{result.assessment.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
                <Label htmlFor="editor-details">Your answers</Label>
                <textarea id="editor-details" required maxLength={3000} disabled={busy} value={authorDetails}
                  onChange={(e) => setAuthorDetails(e.target.value)} placeholder="Share only details you want the editor to use." className={`${inputClass} min-h-28`} />
              </div>
            ) : authorDetails ? <p className="text-xs text-muted">Your answers will be included in this review.</p> : null}
            {error && <Alert>{error}</Alert>}
            {words > maxWords && <Alert tone="medium">Split your writing into sections of up to {maxWords.toLocaleString()} words.</Alert>}
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!text.trim() || !audience.trim() || words > maxWords}>
              {busy ? "Reviewing your writing…" : result?.assessment.questions.length ? "Continue with my answers" : "Review and improve my writing"}
            </Button>
            <p className="text-xs leading-relaxed text-muted">The editor checks your original before revising. It keeps citations, quotations, technical terms and facts, and asks when essential details are missing. Reviews are not saved to your history.</p>
          </form>
        </Card>
        <div aria-live="polite" aria-busy={busy} className="min-w-0 space-y-5">
          {!result && <Card className="p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-ink">A thoughtful edit, with clear feedback</h2>
            <ol className="mt-5 space-y-5 text-sm text-muted">
              <li><strong className="block text-ink">First: three specific weaknesses</strong>Understand what needs attention, with excerpts from your draft.</li>
              <li><strong className="block text-ink">A. Your revised version</strong>Clearer words and natural flow, with your ideas and voice preserved.</li>
              <li><strong className="block text-ink">B. What improved</strong>A short explanation of the changes that matter most.</li>
              <li><strong className="block text-ink">C. Three voice suggestions</strong>Practical ways to make the writing sound more like you.</li>
            </ol>
            {busy && <p role="status" className="mt-6 text-sm text-forest">Checking your draft, preserving your meaning, and preparing feedback. This may take a few minutes.</p>}
          </Card>}
          {result && <>
            <Card className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-ink">Three specific weaknesses</h2>
              <ol className="mt-4 list-decimal space-y-5 pl-5">
                {result.assessment.weaknesses.map((w, i) => <li key={i} className="pl-1 text-sm text-ink-soft">
                  <h3 className="font-semibold text-ink">{w.issue}</h3>
                  <blockquote className="my-2 break-words border-l-2 border-gold pl-3 text-muted">“{w.evidence}”</blockquote>
                  <p className="leading-relaxed">{w.explanation}</p>
                </li>)}
              </ol>
            </Card>
            {result.revision && <>
              <Card className="p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-ink">A. Revised version</h2>
                  <Button type="button" variant="secondary" size="sm" onClick={copyRevision}><Clipboard className="size-4" aria-hidden />Copy</Button>
                </div>
                <div className="mt-4 whitespace-pre-wrap break-words text-[15px] leading-8 text-ink">{result.revision}</div>
                {result.segments.some((s) => s.flags.length) && <div className="mt-5 space-y-2">
                  <h3 className="text-sm font-semibold text-ink">Check these points before using your revision</h3>
                  {result.segments.filter((s) => s.flags.length).map((s) => <details key={s.id} className="rounded-xl bg-risk-medium-bg p-3 text-sm text-risk-medium">
                    <summary className="cursor-pointer">Review note — paragraph {result.segments.indexOf(s) + 1}</summary>
                    <p className="mt-2 whitespace-pre-wrap break-words">Original: {s.original}</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">{s.flags.map((f, i) => <li key={i}>{f.message}</li>)}</ul>
                  </details>)}
                </div>}
              </Card>
              <Card className="p-5 sm:p-6">
                <h2 className="text-lg font-semibold text-ink">B. Most important improvements</h2>
                <p className="mt-3 break-words text-sm leading-relaxed text-ink-soft">{result.improvements}</p>
              </Card>
              <Card className="p-5 sm:p-6">
                <h2 className="text-lg font-semibold text-ink">C. Three suggestions for your voice</h2>
                <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-ink-soft">{result.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ol>
                <Button type="button" variant="secondary" className="mt-5" onClick={downloadReport}><Download className="size-4" aria-hidden />Download full review</Button>
              </Card>
            </>}
          </>}
        </div>
      </div>
    </main>
  );
}
