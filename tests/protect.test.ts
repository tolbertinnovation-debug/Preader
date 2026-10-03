import { describe, expect, it } from "vitest";
import { protect, restore } from "@/lib/text/protect";

describe("protect/restore", () => {
  const text =
    'Smallholder yields rose by 23% (Mensah & Boateng, 2019; Okafor et al., 2021a), and the effect was significant (p < .05, N = 412). As Achebe wrote, "the world is like a mask dancing". See https://doi.org/10.1000/xyz123 and [4, 7].';

  it("masks citations, quotes, stats and links", () => {
    const { masked, tokens } = protect(text, { maskPersonal: false });
    const values = Object.values(tokens);
    expect(values).toContain("(Mensah & Boateng, 2019; Okafor et al., 2021a)");
    expect(values).toContain('"the world is like a mask dancing"');
    expect(values).toContain("23%");
    expect(values).toContain("p < .05");
    expect(values).toContain("N = 412");
    expect(values).toContain("https://doi.org/10.1000/xyz123");
    expect(values).toContain("[4, 7]");
    expect(masked).not.toContain("Mensah");
    expect(masked).not.toContain("mask dancing");
  });

  it("round-trips exactly", () => {
    const { masked, tokens } = protect(text, { maskPersonal: false });
    const r = restore(masked, tokens);
    expect(r.text).toBe(text);
    expect(r.missing).toEqual([]);
  });

  it("detects missing, duplicated and unknown placeholders and tolerates bracket mangling", () => {
    const { masked, tokens } = protect("Growth was 5% (Ade, 2020).", { maskPersonal: false });
    const keys = Object.keys(tokens);
    const mangled = masked.replace(`⟦${keys[0]}⟧`, `[[${keys[0]}]]`);
    expect(restore(mangled, tokens).text).toBe("Growth was 5% (Ade, 2020).");
    const r = restore(`Growth rose ⟦${keys[0]}⟧ ⟦${keys[0]}⟧ ⟦CITE99⟧.`, tokens);
    expect(r.missing).toEqual([keys[1]]);
    expect(r.duplicated).toEqual([keys[0]]);
    expect(r.unknown).toEqual(["CITE99"]);
  });

  it("masks personal details only when asked", () => {
    const t = "Contact ama.owusu@ug.edu.gh or +231 77 123 4567.";
    expect(Object.values(protect(t, { maskPersonal: false }).tokens)).toEqual(["ama.owusu@ug.edu.gh"]);
    const masked = protect(t, { maskPersonal: true });
    expect(Object.values(masked.tokens)).toContain("+231 77 123 4567");
  });

  it("does not treat words ending in R as currency", () => {
    const { tokens } = protect("In the YEAR 2019 we met.", { maskPersonal: false });
    expect(Object.values(tokens)).toEqual([]);
  });
});
