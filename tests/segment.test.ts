import { describe, expect, it } from "vitest";
import { batchSegments, segmentDocument } from "@/lib/text/segment";
import { countWords } from "@/lib/text/words";

describe("segmentDocument", () => {
  const doc = `# Land Tenure in Rural Liberia

Customary land rights shape how families invest. Many households farm land they do not formally own.

2.1 Methods

We interviewed 40 farmers in Bong County.

References

Mensah, K. (2019). Land and labour. Journal of African Studies, 12(3), 1–20.

Okafor, C. (2021). Tenure security. Accra Press.`;

  it("classifies headings, text and reference lists", () => {
    const segs = segmentDocument(doc);
    expect(segs.map((s) => s.kind)).toEqual(["heading", "text", "heading", "text", "preserved", "preserved", "preserved"]);
  });

  it("normalises line endings and blank lines", () => {
    expect(segmentDocument("A first paragraph here.\r\n\r\n\r\n\r\nA second one here.").length).toBe(2);
  });

  it("preserves tables", () => {
    const segs = segmentDocument("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(segs[0]!.kind).toBe("preserved");
  });

  it("batches by word budget", () => {
    const items = Array.from({ length: 5 }, () => ({ text: "one two three four five six seven eight nine ten" }));
    expect(batchSegments(items, 25, countWords).map((b) => b.length)).toEqual([2, 2, 1]);
  });
});
