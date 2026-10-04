"use client";

import Link from "next/link";
import { useState, type KeyboardEvent } from "react";
import { BookOpen, Briefcase, Earth, Feather, GraduationCap, PenLine, Sparkles, X } from "lucide-react";
import { Label, Segmented, Switch, cx, inputClass } from "@/components/ui";
import {
  FORMALITY_LABELS,
  LIMITS,
  MODES,
  MODE_PRESETS,
  READABILITY,
  STRENGTHS,
  TONES,
  VARIETIES,
  type Mode,
  type RewriteOptions,
  type Strength,
} from "@/lib/options";

const MODE_ICONS: Record<Mode, typeof GraduationCap> = {
  academic: GraduationCap,
  research: BookOpen,
  essay: PenLine,
  professional: Briefcase,
  natural: Feather,
  simple: Sparkles,
  panafrican: Earth,
};

const REGIONS = [...new Set(Object.values(VARIETIES).map((v) => v.region))];

export function ControlsPanel({
  options,
  onChange,
  hasVoiceSample,
  disabled,
  onSaveDefaults,
}: {
  options: RewriteOptions;
  onChange: (o: RewriteOptions) => void;
  hasVoiceSample: boolean;
  disabled?: boolean;
  onSaveDefaults: () => void;
}) {
  const set = <K extends keyof RewriteOptions>(k: K, v: RewriteOptions[K]) => onChange({ ...options, [k]: v });
  const [term, setTerm] = useState("");

  function addTerm() {
    const t = term.trim();
    if (!t || options.glossary.includes(t) || options.glossary.length >= LIMITS.maxGlossaryTerms) return;
    set("glossary", [...options.glossary, t.slice(0, 80)]);
    setTerm("");
  }
  function onTermKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTerm();
    }
  }

  return (
    <fieldset disabled={disabled} className="space-y-6 disabled:opacity-70">
      <div>
        <Label>Writing mode</Label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(MODES) as Mode[]).map((m) => {
            const Icon = MODE_ICONS[m];
            const active = options.mode === m;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={active}
                title={MODES[m].blurb}
                onClick={() => onChange({ ...options, ...MODE_PRESETS[m], mode: m })}
                className={cx(
                  "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] font-semibold transition-all",
                  m === "panafrican" && "col-span-2",
                  active ? "border-forest bg-forest-soft text-forest shadow-sm" : "border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{MODES[m].label}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">{MODES[options.mode].blurb}</p>
      </div>

      <div>
        <Label htmlFor="variety">English variety</Label>
        <select id="variety" value={options.variety} onChange={(e) => set("variety", e.target.value as RewriteOptions["variety"])} className={inputClass}>
          {REGIONS.map((r) => (
            <optgroup key={r} label={r}>
              {Object.entries(VARIETIES)
                .filter(([, v]) => v.region === r)
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="tone">Tone</Label>
        <select id="tone" value={options.tone} onChange={(e) => set("tone", e.target.value as RewriteOptions["tone"])} className={inputClass}>
          {Object.entries(TONES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="formality" hint={FORMALITY_LABELS[options.formality - 1]}>
          Formality
        </Label>
        <input
          id="formality"
          type="range"
          min={1}
          max={5}
          step={1}
          value={options.formality}
          onChange={(e) => set("formality", Number(e.target.value) as RewriteOptions["formality"])}
          className="w-full"
          aria-valuetext={FORMALITY_LABELS[options.formality - 1]}
        />
        <div className="mt-0.5 flex justify-between text-[11px] text-muted">
          <span>Casual</span>
          <span>Very formal</span>
        </div>
      </div>

      <div>
        <Label hint={READABILITY[options.readability].hint}>Readability</Label>
        <Segmented
          label="Readability"
          value={options.readability}
          onChange={(v) => set("readability", v)}
          options={(Object.keys(READABILITY) as RewriteOptions["readability"][]).map((k) => ({ value: k, label: READABILITY[k].label, title: READABILITY[k].hint }))}
        />
      </div>

      <div>
        <Label hint={STRENGTHS[options.strength].label}>Rewriting strength</Label>
        <Segmented
          label="Rewriting strength"
          value={options.strength}
          onChange={(v) => set("strength", v)}
          options={([1, 2, 3, 4] as Strength[]).map((k) => ({ value: k, label: STRENGTHS[k].label, title: STRENGTHS[k].hint }))}
        />
        <p className="mt-2 text-xs text-muted">{STRENGTHS[options.strength].hint}</p>
      </div>

      <div className="space-y-4 rounded-2xl border border-line bg-surface p-4">
        <Switch id="preserveVoice" checked={options.preserveVoice} onChange={(v) => set("preserveVoice", v)} label="Preserve my voice" description="Keep your own words, rhythm and expressions, measured from your draft." />
        <Switch
          id="useVoiceSample"
          checked={options.useVoiceSample && hasVoiceSample}
          disabled={!hasVoiceSample}
          onChange={(v) => set("useVoiceSample", v)}
          label="Match my writing sample"
          description={
            hasVoiceSample ? (
              "Also match the habits measured from the writing sample in your settings."
            ) : (
              <>
                Add a sample of your writing in{" "}
                <Link href="/app/settings" className="font-medium text-forest underline">
                  Settings
                </Link>
                .
              </>
            )
          }
        />
        <Switch id="allowIdioms" checked={options.allowIdioms} onChange={(v) => set("allowIdioms", v)} label="Allow local expressions" description="Sparing, natural regional phrasing where the register allows." />
        <Switch id="maskPersonal" checked={options.maskPersonal} onChange={(v) => set("maskPersonal", v)} label="Hide personal details" description="Emails and phone numbers are masked before reaching the AI." />
        <Switch id="privateMode" checked={options.privateMode} onChange={(v) => set("privateMode", v)} label="Private mode" description="Don't save this rewrite to your history." />
      </div>

      <div>
        <Label htmlFor="glossary" hint={`${options.glossary.length}/${LIMITS.maxGlossaryTerms}`}>
          Protected terms
        </Label>
        <input
          id="glossary"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={onTermKey}
          onBlur={addTerm}
          placeholder="e.g. Ubuntu, Bong County, NGO — press Enter"
          className={inputClass}
        />
        {options.glossary.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {options.glossary.map((g) => (
              <span key={g} className="inline-flex items-center gap-1 rounded-full bg-gold-soft py-0.5 pl-2.5 pr-1 text-xs font-medium text-ink">
                {g}
                <button
                  type="button"
                  onClick={() => set("glossary", options.glossary.filter((x) => x !== g))}
                  className="rounded-full p-0.5 text-muted hover:bg-surface hover:text-ink"
                  aria-label={`Remove ${g}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-muted">Names, places and technical terms that must never change.</p>
      </div>

      <button type="button" onClick={onSaveDefaults} className="text-xs font-semibold text-forest hover:underline">
        Save these settings as my defaults
      </button>
    </fieldset>
  );
}
