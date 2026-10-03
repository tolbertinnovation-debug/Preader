import { describe, expect, it } from "vitest";
import { analyze, splitSentences } from "@/lib/text/readability";
import { findCliches } from "@/lib/text/cliches";
import { countWords } from "@/lib/text/words";

describe("text metrics", () => {
  it("splits sentences without breaking on abbreviations", () => {
    expect(splitSentences("Okafor et al. found this. Dr. Mensah agreed! Did it work?")).toHaveLength(3);
  });

  it("counts words across scripts and apostrophes", () => {
    expect(countWords("Côte d’Ivoire's farmers — 1,200 of them — agreed.")).toBe(7);
  });

  it("finds robotic phrases including curly apostrophes", () => {
    const hits = findCliches("In today’s fast-paced world, we delve into data. Furthermore, it plays a crucial role.");
    expect(hits.map((h) => h.phrase)).toEqual(["in today’s fast-paced world", "delve into", "furthermore,", "plays a crucial role"]);
  });

  it("computes rhythm and readability", () => {
    const s = analyze("Short one. This sentence is a fair bit longer than the first one was. Tiny.");
    expect(s.sentences).toBe(3);
    expect(s.rhythmVariety).toBeGreaterThan(3);
    expect(s.readingEase).toBeGreaterThan(50);
  });
});
