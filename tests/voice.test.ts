import { describe, expect, it } from "vitest";
import { buildInstructions } from "@/lib/ai/prompt";
import { runRewrite, type RewriteEvent } from "@/lib/ai/rewrite";
import type { ModelSegmentOutput, Provider, RewriteCall } from "@/lib/ai/types";
import { DEFAULT_OPTIONS } from "@/lib/options";
import { buildVoiceProfile, cleanPinned, describeVoice, droppedExpressions, expressionsToKeep, reduplications, wordsKept } from "@/lib/text/voice";

const SAMPLE = `I grew up in Gbarnga, and I still remember how my grandmother sold pepper in the market. She didn't have much, but she believed in school. "Learn small small," she used to say, "and one day you will carry your people." I've carried those words with me.

Today I work with young people in Monrovia. We teach digital skills, and we help them find scholarships. It's not easy. Many of them walk long distances, and some study by candlelight. But they don't give up. When I see a student finish a course, I feel my grandmother's words again: learn small small.

My people taught me that progress is slow but real. I don't believe in shortcuts. I believe in showing up, every day, for the young people who need us. That is why I started this work, and that is why I'll keep going. Learn small small, and keep your people close.`;

const parse = (input: string) =>
  (JSON.parse(input.slice(input.indexOf("{", input.indexOf("Segments to revise")))) as { segments: { id: string; text: string; keep?: string[] }[] }).segments;

async function collect(gen: AsyncGenerator<RewriteEvent>) {
  const events: RewriteEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe("voice profile", () => {
  const p = buildVoiceProfile(SAMPLE)!;

  it("measures rhythm, contractions, point of view and spelling", () => {
    expect(p.words).toBeGreaterThan(150);
    expect(p.rhythm.avg).toBeGreaterThan(5);
    expect(p.rhythm.p25).toBeLessThanOrEqual(p.rhythm.p75);
    expect(p.contractions).toBe("often");
    expect(p.person).toBe("I");
  });

  it("finds the writer's own expressions, including doubled words", () => {
    expect(p.expressions).toContain("small small");
    expect(p.expressions.some((e) => e.includes("people"))).toBe(true);
    expect(reduplications("They moved small-small and now now it's done.")).toEqual(["small-small", "now now"]);
    expect(reduplications("I had had enough. That that is fine.")).toEqual([]);
  });

  it("describes the profile in plain language", () => {
    const labels = describeVoice(p).map((d) => d.label);
    expect(labels).toEqual(expect.arrayContaining(["Sentence rhythm", "Contractions", "Point of view"]));
  });

  it("needs enough words", () => {
    expect(buildVoiceProfile("Too short to say anything useful.")).toBeNull();
  });
});

describe("keeping expressions", () => {
  it("finds kept expressions despite hyphen and case differences", () => {
    const seg = "We grew Small-Small, but My People stayed together.";
    expect(expressionsToKeep(seg, ["my people", "small small", "grassroots"])).toEqual(["Small-Small", "My People"]);
  });

  it("matches whole words only", () => {
    expect(expressionsToKeep("The peoples of the region", ["people"])).toEqual([]);
  });

  it("reports expressions missing from a revision", () => {
    expect(droppedExpressions("We grew slowly, but my people stayed.", ["small-small", "my people"])).toEqual(["small-small"]);
    expect(droppedExpressions("We grew small small.", ["Small-Small"])).toEqual([]);
  });

  it("measures how much of the writer's wording survived", () => {
    expect(wordsKept("The farmers planted cassava early this year.", "The farmers planted cassava early this year.")).toEqual({ kept: 5, total: 5 });
    const r = wordsKept("The farmers planted cassava early this year.", "Growers sowed manioc ahead of schedule.");
    expect(r.kept).toBe(0);
  });

  it("cleans pinned lists", () => {
    expect(cleanPinned(["my people", "My  People", "", 5, "x".repeat(80)])).toEqual(["my people", "x".repeat(60)]);
  });
});

describe("editor brief", () => {
  it("adds measured habits and keep rules when voice is on", () => {
    const profile = buildVoiceProfile(SAMPLE);
    const brief = buildInstructions({ ...DEFAULT_OPTIONS, preserveVoice: true }, { sample: SAMPLE, sampleProfile: profile, draftProfile: null });
    expect(brief).toContain("# Sounding like the author");
    expect(brief).toContain(`About ${profile!.rhythm.avg} words per sentence`);
    expect(brief).toContain("from their writing sample");
    expect(brief).toMatch(/Never insert these phrases/);
    expect(brief).toContain("<voice_sample>");
  });

  it("omits the voice section when voice options are off", () => {
    const brief = buildInstructions({ ...DEFAULT_OPTIONS, preserveVoice: false, useVoiceSample: false }, null);
    expect(brief).not.toContain("# Sounding like the author");
  });
});

describe("rewriting with the writer's voice", () => {
  const text = `My grandmother told me to learn small small, and I did. I believe my people can rise through education, one student at a time, if we keep showing up for them every single day.`;

  function provider(dropTimes: number) {
    const calls: { keep: string[][]; input: string }[] = [];
    let drops = 0;
    const p: Provider = {
      model: "voice-test",
      async rewrite({ input }: RewriteCall): Promise<ModelSegmentOutput[]> {
        const segs = parse(input);
        calls.push({ keep: segs.map((s) => s.keep ?? []), input });
        const drop = drops++ < dropTimes;
        return segs.map((s) => ({
          id: s.id,
          revised: drop ? s.text.replace(/small small/i, "gradually") : s.text.replace("every single day", "every day"),
          changes: "x",
          meaning_risk: "none",
          risk_note: "",
        }));
      },
      async embed() {
        return null;
      },
    };
    return { p, calls };
  }

  const run = (p: Provider, phrases: string[] = []) =>
    collect(
      runRewrite({
        text,
        options: { ...DEFAULT_OPTIONS, preserveVoice: true },
        voiceSample: null,
        voicePhrases: phrases,
        provider: p,
        safetyId: "t",
        signal: new AbortController().signal,
        meaningCheck: false,
      }),
    );

  it("sends the writer's expressions and retries once when one is dropped", async () => {
    const { p, calls } = provider(1);
    const events = await run(p, ["my people"]);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.keep[0]).toEqual(expect.arrayContaining(["small small", "my people"]));
    expect(calls[1]!.input).toContain(`keep the author's own expressions exactly as written: "small small"`);
    const done = events.at(-1)!;
    if (done.type !== "done") throw new Error("expected done");
    expect(done.results[0]!.revised).toContain("small small");
    expect(done.results[0]!.voice?.dropped).toEqual([]);
    expect(done.summary.voice).toMatchObject({ expressionsKept: 2, expressionsTotal: 2, reference: "draft" });
    expect(done.summary.voice!.wordsKept).toBeGreaterThan(0.9);
  });

  it("reports an expression that still didn't survive, without raising a meaning flag", async () => {
    const { p } = provider(5);
    const done = (await run(p)).at(-1)!;
    if (done.type !== "done") throw new Error("expected done");
    expect(done.results[0]!.voice?.dropped).toEqual(["small small"]);
    expect(done.results[0]!.flags.some((f) => f.code.includes("voice"))).toBe(false);
    expect(done.summary.voice).toMatchObject({ expressionsKept: 0, expressionsTotal: 1 });
  });

  it("adds no voice data when voice options are off", async () => {
    const { p, calls } = provider(0);
    const done = (
      await collect(
        runRewrite({
          text,
          options: { ...DEFAULT_OPTIONS, preserveVoice: false, useVoiceSample: false },
          voiceSample: null,
          provider: p,
          safetyId: "t",
          signal: new AbortController().signal,
          meaningCheck: false,
        }),
      )
    ).at(-1)!;
    if (done.type !== "done") throw new Error("expected done");
    expect(calls[0]!.keep[0]).toEqual([]);
    expect(done.summary.voice).toBeUndefined();
    expect(done.results[0]!.voice).toBeUndefined();
  });
});
