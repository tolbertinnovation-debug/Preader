import { describe, expect, it } from "vitest";
import { numbersIn, verifySegment } from "@/lib/text/verify";
import type { RestoreResult } from "@/lib/text/protect";

const clean: RestoreResult = { text: "", missing: [], duplicated: [], unknown: [] };
const base = { restore: clean, glossary: [], modelRisk: "none" as const, modelNote: "", similarity: null };

describe("verifySegment", () => {
  it("passes a faithful paraphrase", () => {
    const r = verifySegment({
      ...base,
      original: "The findings suggest that access to credit may improve yields for 40 farmers.",
      revised: "For the 40 farmers studied, access to credit may improve yields, the findings suggest.",
    });
    expect(r.risk).toBe("none");
  });

  it("flags lost and invented figures", () => {
    const r = verifySegment({ ...base, original: "Yields rose in 2019 among 40 farms.", revised: "Yields rose in 2020 among forty farms." });
    expect(r.flags.map((f) => f.code)).toEqual(expect.arrayContaining(["number_missing", "number_added"]));
    expect(r.risk).toBe("high");
  });

  it("treats number words as numbers", () => {
    expect(numbersIn("three villages and 3 clinics").get("3")).toBe(2);
  });

  it("flags hedging removed and causal language added", () => {
    const r = verifySegment({ ...base, original: "Poverty may be associated with low enrolment.", revised: "Poverty causes low enrolment." });
    const codes = r.flags.map((f) => f.code);
    expect(codes).toContain("certainty_up");
    expect(codes).toContain("causal");
  });

  it("flags negation changes", () => {
    const r = verifySegment({ ...base, original: "The policy did not reduce costs.", revised: "The policy reduced costs." });
    expect(r.flags.map((f) => f.code)).toContain("negation");
  });

  it("flags invented citations", () => {
    const r = verifySegment({ ...base, original: "Trade grew quickly.", revised: "Trade grew quickly (Smith, 2020)." });
    expect(r.flags.map((f) => f.code)).toContain("citation_added");
  });

  it("flags low semantic similarity and dropped protected content", () => {
    const r = verifySegment({
      ...base,
      original: "Farmers in Nimba County adopted improved seed varieties rapidly after the programme.",
      revised: "Teachers in Monrovia changed their curriculum after the programme ended.",
      similarity: 0.71,
      restore: { ...clean, missing: ["CITE1"] },
    });
    const codes = r.flags.map((f) => f.code);
    expect(codes).toContain("low_similarity");
    expect(codes).toContain("protected_missing");
  });

  it("flags changed glossary terms", () => {
    const r = verifySegment({ ...base, glossary: ["Ubuntu"], original: "Ubuntu guides the community.", revised: "Shared humanity guides the community." });
    expect(r.flags.map((f) => f.code)).toContain("term_changed");
  });
});
