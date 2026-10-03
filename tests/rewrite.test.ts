import { describe, expect, it } from "vitest";
import { runRewrite, type RewriteEvent } from "@/lib/ai/rewrite";
import { MockProvider } from "@/lib/ai/mock";
import type { ModelSegmentOutput, Provider, RewriteCall } from "@/lib/ai/types";
import { DEFAULT_OPTIONS } from "@/lib/options";

async function collect(gen: AsyncGenerator<RewriteEvent>) {
  const events: RewriteEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

const doc = `Introduction

It is important to note that land tenure plays a crucial role in rural Liberia (Mensah, 2019). Furthermore, 62% of households farm customary land.

In order to understand this, we utilize interviews with 40 farmers.

References

Mensah, K. (2019). Land and labour.`;

describe("runRewrite", () => {
  it("streams segments in a full, restorable result", async () => {
    const events = await collect(
      runRewrite({
        text: doc,
        options: DEFAULT_OPTIONS,
        voiceSample: null,
        provider: new MockProvider(),
        safetyId: "test",
        signal: new AbortController().signal,
        meaningCheck: true,
      }),
    );
    expect(events[0]!.type).toBe("meta");
    const done = events.at(-1)!;
    if (done.type !== "done") throw new Error("expected done");
    expect(done.results).toHaveLength(5);
    const para = done.results[1]!;
    expect(para.revised).toContain("(Mensah, 2019)");
    expect(para.revised).toContain("62%");
    expect(para.revised).not.toMatch(/important to note/);
    expect(done.results[4]!.kind).toBe("preserved");
    expect(done.summary.after.roboticPhrases).toBeLessThan(done.summary.before.roboticPhrases);
  });

  it("retries once, then keeps the original when a model drops protected content", async () => {
    let calls = 0;
    const dropping: Provider = {
      model: "dropper",
      async rewrite({ input }: RewriteCall): Promise<ModelSegmentOutput[]> {
        calls++;
        const { segments } = JSON.parse(input.slice(input.indexOf("{", input.indexOf("Segments to revise")))) as {
          segments: { id: string; text: string }[];
        };
        return segments.map((s) => ({ id: s.id, revised: s.text.replace(/⟦CITE\d+⟧/g, ""), changes: "x", meaning_risk: "none", risk_note: "" }));
      },
      async embed() {
        return null;
      },
    };
    const events = await collect(
      runRewrite({
        text: "Tenure matters a great deal for investment decisions (Mensah, 2019).",
        options: DEFAULT_OPTIONS,
        voiceSample: null,
        provider: dropping,
        safetyId: "t",
        signal: new AbortController().signal,
        meaningCheck: false,
      }),
    );
    const done = events.at(-1)!;
    if (done.type !== "done") throw new Error("expected done");
    expect(calls).toBe(2);
    expect(done.results[0]!.revised).toBe("Tenure matters a great deal for investment decisions (Mensah, 2019).");
    expect(done.results[0]!.flags[0]!.code).toBe("kept_original");
  });

  it("propagates provider errors", async () => {
    const failing: Provider = {
      model: "f",
      async rewrite() {
        throw new Error("boom");
      },
      async embed() {
        return null;
      },
    };
    await expect(
      collect(
        runRewrite({
          text: "A paragraph of ordinary text that needs editing.",
          options: DEFAULT_OPTIONS,
          voiceSample: null,
          provider: failing,
          safetyId: "t",
          signal: new AbortController().signal,
          meaningCheck: false,
        }),
      ),
    ).rejects.toThrow("boom");
  });
});
