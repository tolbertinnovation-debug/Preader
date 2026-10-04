"use client";

import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { FileUp, Plus, X } from "lucide-react";
import { Button, cx, inputClass, useToast } from "@/components/ui";
import { api, ApiError, toApiError } from "@/lib/client";
import { LIMITS } from "@/lib/options";
import { buildVoiceProfile, cleanPinned, describeVoice, normalisePhrase, VOICE_LIMITS } from "@/lib/text/voice";
import { countWords } from "@/lib/text/words";

export function VoiceSettings({ voiceSample, voicePhrases }: { voiceSample: string | null; voicePhrases: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [sample, setSample] = useState(voiceSample ?? "");
  const [pinned, setPinned] = useState<string[]>(voicePhrases);
  const [newPhrase, setNewPhrase] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const deferred = useDeferredValue(sample);
  const profile = useMemo(() => buildVoiceProfile(deferred), [deferred]);
  const words = countWords(sample);
  const pinnedNorm = new Set(pinned.map(normalisePhrase));
  const suggestions = (profile?.expressions ?? []).filter((e) => !pinnedNorm.has(normalisePhrase(e)));
  const phrasesChanged = JSON.stringify(pinned) !== JSON.stringify(voicePhrases);

  async function save(key: string, body: Record<string, unknown>, success: string) {
    setBusy(key);
    try {
      await api("/api/account", { method: "PATCH", body });
      toast(success);
      router.refresh();
      return true;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Something went wrong.", "high");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function addFile(file: File) {
    setBusy("file");
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/files/parse", { method: "POST", body: fd, credentials: "same-origin" });
      if (!res.ok) throw await toApiError(res);
      const { text } = (await res.json()) as { text: string };
      const next = [sample.trim(), text.trim()].filter(Boolean).join("\n\n").slice(0, LIMITS.maxVoiceSampleChars);
      setSample(next);
      toast(next.length >= LIMITS.maxVoiceSampleChars ? `Added ${file.name} (trimmed to fit). Remember to save.` : `Added ${file.name}. Remember to save.`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "We couldn't read that file.", "high");
    } finally {
      setBusy(null);
    }
  }

  function pin(phrase: string) {
    const next = cleanPinned([...pinned, phrase]);
    if (next.length === pinned.length) {
      if (pinned.length >= VOICE_LIMITS.maxPinned) toast(`You can keep up to ${VOICE_LIMITS.maxPinned} expressions.`, "high");
      return;
    }
    setPinned(next);
  }

  const quality = words < VOICE_LIMITS.minWords ? "too short to measure" : words < 300 ? "enough for a rough picture; 300+ words is better" : words < 600 ? "good" : "excellent";

  return (
    <div className="space-y-6">
      <div>
        <textarea
          value={sample}
          onChange={(e) => setSample(e.target.value)}
          maxLength={LIMITS.maxVoiceSampleChars}
          rows={8}
          placeholder="Paste something you wrote yourself: an essay, report, blog post or long message…"
          className={`${inputClass} prose-doc !text-[15px]`}
          aria-label="Writing sample"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={() => save("voice", { voiceSample: sample.trim() || null }, sample.trim() ? "Writing sample saved." : "Writing sample removed.")} loading={busy === "voice"}>
            Save sample
          </Button>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept=".docx,.pdf,.txt,.md,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,text/plain,text/markdown"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void addFile(f);
            }}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={busy === "file"}>
            <FileUp className="size-4" /> Add from a file
          </Button>
          {voiceSample && (
            <Button
              variant="ghost"
              onClick={async () => {
                if (await save("voice-del", { voiceSample: null }, "Writing sample removed.")) setSample("");
              }}
              loading={busy === "voice-del"}
            >
              Remove
            </Button>
          )}
          <span className="ml-auto text-xs text-muted">
            {words.toLocaleString()} words · {sample.length.toLocaleString()}/{LIMITS.maxVoiceSampleChars.toLocaleString()} characters
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-sunken/40 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">Your voice profile</h3>
          <span className={cx("text-xs", words < VOICE_LIMITS.minWords ? "text-muted" : "text-forest")}>Sample: {quality}</span>
        </div>
        {profile ? (
          <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[150px_minmax(0,1fr)]">
            {describeVoice(profile)
              .filter((d) => d.label !== "Expressions")
              .map((d) => (
                <div key={d.label} className="contents">
                  <dt className="font-medium text-ink-soft">{d.label}</dt>
                  <dd className="text-ink">{d.detail}</dd>
                </div>
              ))}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted">Add at least {VOICE_LIMITS.minWords} words of your own writing to see how you write.</p>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted">
          When “Match my writing sample” is on, PanPen keeps rewrites close to these habits. With “Preserve my voice”, it measures the same habits from the draft you are revising.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-ink">Expressions to always keep</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">
          Phrases that are yours: sayings, local expressions or the way you name things (e.g. “small-small”, “my people”, “the grassroots”). PanPen keeps them word for word wherever they appear in your text, and never adds them where you didn&apos;t use them.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {pinned.map((p) => (
            <span key={p} className="inline-flex items-center gap-1 rounded-full bg-forest-soft py-1 pl-3 pr-1 text-sm font-medium text-forest">
              {p}
              <button type="button" onClick={() => setPinned(pinned.filter((x) => x !== p))} aria-label={`Remove ${p}`} className="rounded-full p-0.5 hover:bg-forest/10">
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          {!pinned.length && <span className="text-sm text-muted">None yet.</span>}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newPhrase.trim()) pin(newPhrase);
            setNewPhrase("");
          }}
        >
          <input
            value={newPhrase}
            onChange={(e) => setNewPhrase(e.target.value)}
            maxLength={VOICE_LIMITS.maxPinnedChars}
            placeholder="Add an expression…"
            aria-label="Add an expression to keep"
            className={cx(inputClass, "!py-2")}
          />
          <Button type="submit" variant="secondary" disabled={!newPhrase.trim()}>
            <Plus className="size-4" /> Add
          </Button>
        </form>
        {suggestions.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-muted">Found in your sample (tap to keep):</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => pin(s)}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-xs text-ink-soft hover:border-forest hover:text-forest"
                >
                  <Plus className="size-3" /> {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3">
          <Button onClick={() => save("phrases", { voicePhrases: pinned }, "Expressions saved.")} loading={busy === "phrases"} disabled={!phrasesChanged}>
            Save expressions
          </Button>
        </div>
      </div>
    </div>
  );
}
