import { describe, expect, it } from "vitest";
import { buildImagePrompt } from "@/lib/images/prompt";
import { supportsCustomSize, targetSize } from "@/lib/images/size";
import { sniffImage } from "@/lib/images/validate";

describe("buildImagePrompt", () => {
  it("always leads with identity and skin-tone preservation", () => {
    const p = buildImagePrompt({ subject: "people", strength: 2, focus: ["skin"] });
    expect(p.indexOf("PRESERVE")).toBeLessThan(p.indexOf("IMPROVE"));
    expect(p).toMatch(/Never lighten/);
    expect(p).toMatch(/hair texture/);
    expect(p).toMatch(/Skin: render real skin texture/);
    expect(p).not.toMatch(/Anatomy:/);
  });

  it("falls back to every focus area when none is selected, and reflects strength", () => {
    const p = buildImagePrompt({ subject: "people", strength: 3, focus: [] });
    for (const k of ["Skin:", "Lighting:", "Anatomy:", "Artefacts:"]) expect(p).toContain(k);
    expect(p).toContain("STRONG");
  });
});

describe("subject-specific preservation", () => {
  it("keeps every word and price on posters and forbids rewriting text", () => {
    const p = buildImagePrompt({ subject: "graphic", strength: 2, focus: ["artifacts"] });
    expect(p).toMatch(/designed graphic/);
    expect(p).toMatch(/Do not rewrite, correct, translate, add or remove any text/);
    expect(p).toMatch(/phone number/);
    expect(p).not.toMatch(/photorealistic image/);
  });

  it("protects product branding, and still protects any people in products and places", () => {
    const product = buildImagePrompt({ subject: "product", strength: 1, focus: ["lighting"] });
    expect(product).toMatch(/branding, labels, logos/);
    expect(product).toMatch(/Never lighten/);
    const scene = buildImagePrompt({ subject: "scene", strength: 1, focus: ["lighting"] });
    expect(scene).toMatch(/architecture, landmarks/);
    expect(scene).toMatch(/Never lighten/);
  });
});

describe("targetSize", () => {
  it("keeps aspect ratio with sides divisible by 16 and caps the long edge", () => {
    const [w, h] = targetSize(4032, 3024).split("x").map(Number);
    expect(w).toBe(2048);
    expect(h! % 16).toBe(0);
    expect(Math.abs(w! / h! - 4 / 3)).toBeLessThan(0.02);
  });

  it("does not upscale small images and clamps extreme aspect ratios to 3:1", () => {
    expect(targetSize(800, 600)).toBe("800x608");
    const [w, h] = targetSize(3000, 500).split("x").map(Number);
    expect(w! / h!).toBeLessThanOrEqual(3.05);
  });

  it("only uses custom sizes on models that support them", () => {
    expect(supportsCustomSize("gpt-image-2")).toBe(true);
    expect(supportsCustomSize("gpt-image-1.5")).toBe(false);
  });
});

describe("sniffImage", () => {
  it("recognises JPEG, PNG and WebP by magic bytes, and rejects others", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("webp");
    expect(sniffImage(new TextEncoder().encode("<svg xmlns="))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("GIF89a"))).toBeNull();
  });
});
