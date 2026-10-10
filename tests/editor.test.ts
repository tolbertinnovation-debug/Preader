import { describe, expect, it, vi } from "vitest";
import { assessmentSchema, editorOptions, editorRequestSchema, runEditor, type FeedbackCall } from "@/lib/editor/review";
import { MockProvider } from "@/lib/ai/mock";
import { DEFAULT_OPTIONS } from "@/lib/options";

const text = `It is important to note that we interviewed 40 farmers in Liberia (Mensah, 2019). Furthermore, 62% said, "We need more support".\n\nIn order to understand this, we utilize interviews.\n\nReferences\n\nMensah, K. (2019). Land and labour.`;
const body = editorRequestSchema.parse({ text, audience: "Liberian community leaders", tone: "professional" });
const assessment = {
  weaknesses: [
    { issue: "Filler", evidence: "It is important to note that", explanation: "Open with your finding." },
    { issue: "Stock transition", evidence: "Furthermore", explanation: "Connect the ideas directly." },
    { issue: "Formal word choice", evidence: "utilize", explanation: "Use a simpler verb." },
  ], questions: [],
};
const report = { improvements: "Removed filler and used simpler verbs while keeping the findings.", suggestions: ["Keep your direct first-person wording.", "Retain the place names you use.", "Read it aloud and keep expressions you normally say."] };
const params = { body, defaults: DEFAULT_OPTIONS, voiceSample: null, voicePhrases: [], safetyId: "test", signal: new AbortController().signal, meaningCheck: false };

describe("authentic writing editor", () => {
  it("assesses before rewriting, reports actual changes and preserves protected content", async () => {
    const sequence: string[] = [];
    const provider = new MockProvider();
    const originalRewrite = provider.rewrite.bind(provider);
    provider.rewrite = async (call) => { sequence.push("rewrite"); expect(call.instructions).toContain(body.audience); return originalRewrite(call); };
    const feedback: FeedbackCall = async (call, name) => {
      sequence.push(name);
      if (name === "editor_report") {
        const input = JSON.parse(call.input);
        expect(input.revision).not.toContain("It is important to note that");
        expect(input.original).toBe(text);
        return report;
      }
      return assessment;
    };
    const result = await runEditor({ ...params, provider, feedback });
    expect(sequence[0]).toBe("editor_assessment");
    expect(sequence.at(-1)).toBe("editor_report");
    expect(sequence).toContain("rewrite");
    expect(result.revision).toContain("(Mensah, 2019)");
    expect(result.revision).toContain("62%");
    expect(result.revision).toContain('"We need more support"');
    expect(result.revision).toContain("40 farmers");
    expect(result.revision).toContain("Mensah, K. (2019). Land and labour.");
    expect(result.suggestions).toHaveLength(3);
    expect(result.assessment.weaknesses).toHaveLength(3);
  });

  it("asks for missing personal details without making a revision call", async () => {
    const provider = new MockProvider();
    const rewrite = vi.spyOn(provider, "rewrite");
    const feedback = vi.fn(async () => ({ ...assessment, questions: ["What did you mean by support?"] }));
    const result = await runEditor({ ...params, provider, feedback });
    expect(result.revision).toBeNull();
    expect(result.assessment.questions).toHaveLength(1);
    expect(rewrite).not.toHaveBeenCalled();
    expect(feedback).toHaveBeenCalledTimes(1);
  });

  it("includes author answers and optional voice sample on a follow-up", async () => {
    const provider = new MockProvider();
    const rewrite = vi.spyOn(provider, "rewrite");
    const feedback = vi.fn(async (_call, name) => name === "editor_assessment" ? assessment : report) as FeedbackCall;
    await runEditor({ ...params, body: { ...body, authorDetails: "Support means training, as in my draft.", useVoiceSample: true },
      voiceSample: "My people, let us learn small-small.", provider, feedback });
    expect(rewrite.mock.calls[0]![0].instructions).toContain("Support means training");
    expect(rewrite.mock.calls[0]![0].instructions).toContain("My people, let us learn small-small.");
    expect(JSON.parse((feedback as ReturnType<typeof vi.fn>).mock.calls[0]![0].input).authorDetails).toContain("Support means");
  });

  it("rejects feedback that fabricates an excerpt from the original", async () => {
    const provider = new MockProvider();
    const rewrite = vi.spyOn(provider, "rewrite");
    await expect(runEditor({ ...params, provider, feedback: async () => ({ ...assessment,
      weaknesses: assessment.weaknesses.map((w, i) => i === 0 ? { ...w, evidence: "I changed 500 lives" } : w),
    }) })).rejects.toThrow("evidence validation");
    expect(rewrite).not.toHaveBeenCalled();
  });

  it("rejects wrong feedback counts and empty audience", () => {
    expect(assessmentSchema.safeParse({ ...assessment, weaknesses: assessment.weaknesses.slice(0, 2) }).success).toBe(false);
    expect(editorRequestSchema.safeParse({ ...body, audience: " " }).success).toBe(false);
    expect(editorRequestSchema.safeParse({ ...body, tone: "other" }).success).toBe(false);
  });

  it("maps the five tones while always protecting voice and keeping reviews private", () => {
    for (const tone of ["conversational", "professional", "academic", "persuasive", "personal"] as const) {
      const options = editorOptions({ ...body, tone }, { ...DEFAULT_OPTIONS, variety: "liberian", glossary: ["AVSEC"] });
      expect(options.preserveVoice).toBe(true);
      expect(options.privateMode).toBe(true);
      expect(options.variety).toBe("liberian");
      expect(options.glossary).toEqual(["AVSEC"]);
      if (tone === "academic") expect(options.mode).toBe("academic");
      if (tone === "persuasive") expect(options.tone).toBe("persuasive");
    }
  });
});
