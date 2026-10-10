import { describe, expect, it } from "vitest";
import { resolveOptions } from "@/lib/preferences";

describe("shared writing defaults", () => {
  it("uses the selected settings for new users and users without saved preferences", () => {
    for (const preferences of [undefined, null, {}]) {
      expect(resolveOptions(preferences)).toEqual({
        mode: "natural", variety: "liberian", tone: "neutral", formality: 2,
        readability: "general", strength: 4, preserveVoice: true,
        allowIdioms: true, useVoiceSample: true, maskPersonal: false,
        privateMode: false, glossary: [],
      });
    }
  });

  it("retains saved user choices and fills unspecified settings with shared defaults", () => {
    expect(resolveOptions({ mode: "academic", privateMode: true, variety: "british" })).toMatchObject({
      mode: "academic", privateMode: true, variety: "british", strength: 4,
      useVoiceSample: true, preserveVoice: true,
    });
  });
});
