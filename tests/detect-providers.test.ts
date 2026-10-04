import { afterEach, describe, expect, it } from "vitest";
import { detectImageSightengine, detectTextGptZero } from "@/lib/detect/providers";

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as typeof fetch;

afterEach(() => {
  delete process.env.GPTZERO_API_KEY;
  delete process.env.SIGHTENGINE_API_USER;
  delete process.env.SIGHTENGINE_API_SECRET;
});

describe("GPTZero adapter", () => {
  it("is reported as not configured without a key (and makes no request)", async () => {
    let called = false;
    const r = await detectTextGptZero("text", { fetchImpl: (async () => ((called = true), new Response())) as typeof fetch });
    expect(r.status).toBe("not_configured");
    expect(called).toBe(false);
  });

  it("parses class probabilities and sentence scores", async () => {
    process.env.GPTZERO_API_KEY = "k";
    let sent: RequestInit | undefined;
    const r = await detectTextGptZero("Hello there.", {
      fetchImpl: (async (_url: string, init: RequestInit) => {
        sent = init;
        return new Response(
          JSON.stringify({ documents: [{ class_probabilities: { ai: 0.91, human: 0.04, mixed: 0.05 }, confidence_category: "high", sentences: [{ sentence: "Hello there.", generated_prob: 0.9 }] }] }),
        );
      }) as typeof fetch,
    });
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.output.score).toEqual({ provider: "GPTZero", ai: 0.91, human: 0.04, mixed: 0.05, confidence: "high" });
    expect(r.output.sentences).toEqual([{ text: "Hello there.", ai: 0.9 }]);
    expect((sent!.headers as Record<string, string>)["x-api-key"]).toBe("k");
  });

  it("refuses malformed or out-of-range numbers instead of guessing", async () => {
    process.env.GPTZERO_API_KEY = "k";
    for (const body of [{}, { documents: [] }, { documents: [{ class_probabilities: { ai: 1.7, human: 0 } }] }, { documents: [{ sentences: [] }] }]) {
      const r = await detectTextGptZero("x", { fetchImpl: reply(200, body) });
      expect(r.status).toBe("error");
    }
  });

  it("explains auth and rate-limit failures", async () => {
    process.env.GPTZERO_API_KEY = "k";
    expect(await detectTextGptZero("x", { fetchImpl: reply(401, {}) })).toMatchObject({ status: "error", message: expect.stringMatching(/API key/) });
    expect(await detectTextGptZero("x", { fetchImpl: reply(429, {}) })).toMatchObject({ status: "error", message: expect.stringMatching(/rate-limiting/) });
  });
});

describe("Sightengine adapter", () => {
  it("parses the genai score", async () => {
    process.env.SIGHTENGINE_API_USER = "u";
    process.env.SIGHTENGINE_API_SECRET = "s";
    const r = await detectImageSightengine(Buffer.from("img"), "image/png", { fetchImpl: reply(200, { status: "success", type: { ai_generated: 0.88 } }) });
    expect(r).toMatchObject({ status: "ok", output: { score: { ai: 0.88, provider: "Sightengine" } } });
  });

  it("reports API failures without a score", async () => {
    process.env.SIGHTENGINE_API_USER = "u";
    process.env.SIGHTENGINE_API_SECRET = "s";
    const r = await detectImageSightengine(Buffer.from("img"), "image/png", { fetchImpl: reply(200, { status: "failure", error: { message: "Image too small" } }) });
    expect(r).toMatchObject({ status: "error", message: expect.stringMatching(/Image too small/) });
    const r2 = await detectImageSightengine(Buffer.from("img"), "image/png", { fetchImpl: reply(200, { status: "success", type: {} }) });
    expect(r2.status).toBe("error");
  });
});
