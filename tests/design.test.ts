import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN, FORMATS, MAX_BULLETS, MAX_ITEMS, sanitizeDesign } from "@/lib/design/templates";

describe("sanitizeDesign", () => {
  it("returns the example design for missing or invalid input", () => {
    expect(sanitizeDesign(null)).toEqual(DEFAULT_DESIGN);
    expect(sanitizeDesign("nonsense")).toEqual(DEFAULT_DESIGN);
  });

  it("rejects unknown templates, sizes and themes", () => {
    const d = sanitizeDesign({ template: "hack", format: "huge", theme: "neon", headlineFont: "comic" });
    expect(d.template).toBe("promo");
    expect(d.format).toBe("square");
    expect(d.theme).toBe("panpen");
    expect(d.headlineFont).toBe("sans");
  });

  it("caps list lengths and string sizes", () => {
    const d = sanitizeDesign({
      items: Array.from({ length: 9 }, () => ({ title: "x".repeat(500), price: "$1" })),
      bullets: Array.from({ length: 20 }, () => "point"),
      headline: "h".repeat(1000),
    });
    expect(d.items).toHaveLength(MAX_ITEMS);
    expect(d.items[0]!.title).toHaveLength(60);
    expect(d.items[0]!.oldPrice).toBe("");
    expect(d.bullets).toHaveLength(MAX_BULLETS);
    expect(d.headline).toHaveLength(120);
  });

  it("offers print-quality A4 at 300 dpi", () => {
    expect(FORMATS.a4).toMatchObject({ width: 2480, height: 3508 });
  });
});
