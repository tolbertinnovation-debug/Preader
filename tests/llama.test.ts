import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { chatCompletion, extractJson, LlamaApiError, type ClientOptions } from "@/lib/ai/llama";
import { LlamaProvider, parseOutput, requestStructured } from "@/lib/ai/provider";
import { IncompleteError } from "@/lib/ai/types";
import { HttpError } from "@/lib/http";

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const status = (code: number, body = "{}", headers: Record<string, string> = {}) => new Response(body, { status: code, headers });

function opts(fetchImpl: typeof fetch, extra: Partial<ClientOptions> = {}): ClientOptions {
  return { apiKey: "test-key", baseUrl: "https://api.llama.com/compat/v1/", timeoutMs: 5_000, maxRetries: 2, fetchImpl, ...extra };
}

const segmentsJson = JSON.stringify({ segments: [{ id: "s1", revised: "Better text.", changes: "Tightened.", meaning_risk: "none", risk_note: "" }] });
const completion = (content: string, finish_reason = "stop") => ({ choices: [{ finish_reason, message: { role: "assistant", content } }] });

describe("chatCompletion", () => {
  it("posts to the compat chat completions endpoint with a bearer key", async () => {
    const f = fakeFetch([ok(completion("{}"))]);
    await chatCompletion({ model: "m", messages: [{ role: "user", content: "hi" }] }, new AbortController().signal, opts(f.impl));
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url).toBe("https://api.llama.com/compat/v1/chat/completions");
    const headers = f.calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(String(f.calls[0]!.init.body)).model).toBe("m");
  });

  it("retries 429 and 5xx, then succeeds", async () => {
    const f = fakeFetch([status(429, "{}", { "retry-after": "0" }), status(503), ok(completion("{}"))]);
    const res = await chatCompletion({ model: "m", messages: [] }, new AbortController().signal, opts(f.impl));
    expect(f.calls).toHaveLength(3);
    expect(res.choices?.[0]?.finish_reason).toBe("stop");
  });

  it("does not retry client errors and surfaces the provider message", async () => {
    const f = fakeFetch([status(400, JSON.stringify({ error: { message: "bad schema" } }))]);
    const err = await chatCompletion({ model: "m", messages: [] }, new AbortController().signal, opts(f.impl)).catch((e) => e);
    expect(err).toBeInstanceOf(LlamaApiError);
    expect((err as LlamaApiError).status).toBe(400);
    expect((err as LlamaApiError).message).toBe("bad schema");
    expect(f.calls).toHaveLength(1);
  });

  it("propagates a caller abort as an AbortError", async () => {
    const ac = new AbortController();
    ac.abort();
    const f = fakeFetch([Object.assign(new Error("aborted"), { name: "AbortError" })]);
    const err = await chatCompletion({ model: "m", messages: [] }, ac.signal, opts(f.impl)).catch((e) => e);
    expect((err as Error).name).toBe("AbortError");
  });
});

describe("extractJson", () => {
  it("accepts bare JSON, fenced JSON and JSON with surrounding text", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Here you go: {"a":3} Hope that helps.')).toEqual({ a: 3 });
  });
});

describe("parseOutput", () => {
  it("normalises missing optional fields and drops malformed entries", () => {
    const out = parseOutput(JSON.stringify({ segments: [{ id: "a", revised: "x" }, { id: 3 }, { id: "b", revised: "y", meaning_risk: "high", risk_note: "n", changes: "c" }] }));
    expect(out).toEqual([
      { id: "a", revised: "x", changes: "", meaning_risk: "none", risk_note: "" },
      { id: "b", revised: "y", changes: "c", meaning_risk: "high", risk_note: "n" },
    ]);
  });

  it("rejects unreadable output", () => {
    expect(() => parseOutput("not json")).toThrow(HttpError);
  });
});

describe("LlamaProvider", () => {
  const call = { instructions: "Edit.", input: "Segments to revise: {}", signal: new AbortController().signal };

  it("sends a system + user message with a JSON schema and parses segments", async () => {
    const f = fakeFetch([ok(completion(segmentsJson))]);
    const out = await new LlamaProvider(opts(f.impl)).rewrite(call);
    expect(out[0]).toMatchObject({ id: "s1", revised: "Better text." });
    const body = JSON.parse(String(f.calls[0]!.init.body));
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.schema.required).toContain("segments");
    expect(body.model).toMatch(/Llama/);
  });

  it("treats a truncated response as incomplete so the batch can be split", async () => {
    const f = fakeFetch([ok(completion('{"segments":[', "length"))]);
    await expect(new LlamaProvider(opts(f.impl)).rewrite(call)).rejects.toBeInstanceOf(IncompleteError);
  });

  it("maps auth failures to a friendly 503", async () => {
    const f = fakeFetch([status(401)]);
    const err = await new LlamaProvider(opts(f.impl)).rewrite(call).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(503);
    expect((err as HttpError).code).toBe("ai_unconfigured");
  });

  it("returns no embeddings (the Llama API has none)", async () => {
    expect(await new LlamaProvider(opts(fakeFetch([]).impl)).embed()).toBeNull();
  });
});

describe("requestStructured (Editor feedback)", () => {
  const call = { instructions: "Assess.", input: "{}", signal: new AbortController().signal };
  const schema = { type: "object", properties: { score: { type: "number" } }, required: ["score"] };

  it("sends the editor's schema and returns the parsed JSON", async () => {
    const f = fakeFetch([ok(completion('```json\n{"score": 7}\n```'))]);
    expect(await requestStructured(call, "assessment", schema, opts(f.impl))).toEqual({ score: 7 });
    const body = JSON.parse(String(f.calls[0]!.init.body));
    expect(body.response_format.json_schema).toEqual({ name: "assessment", schema });
  });

  it("reports a truncated reply as an incomplete editor response", async () => {
    const f = fakeFetch([ok(completion('{"score":', "length"))]);
    const err = await requestStructured(call, "assessment", schema, opts(f.impl)).catch((e) => e);
    expect((err as HttpError).code).toBe("editor_incomplete");
  });
});
