import { IMAGE_FOCUS, type ImageOptions } from "./options";

export const IMAGE_PROMPT_VERSION = "2026-10-03.1";

const STRENGTH: Record<ImageOptions["strength"], string> = {
  1: "SUBTLE: make only light, local corrections. A side-by-side comparison should show the same image with its artificial look gently removed.",
  2: "BALANCED: correct texture, light and obvious flaws throughout, so the result reads as a natural photograph of the same scene.",
  3: "STRONG: thoroughly rework every artificial-looking surface and flaw so the result is indistinguishable in quality from a professional photograph of the same scene — while every preservation rule still applies in full.",
};

const FOCUS_RULES: Record<keyof typeof IMAGE_FOCUS, string> = {
  skin:
    "Skin: render real skin texture — visible pores, fine lines, subtle tonal variation, natural specular highlights. Remove waxy, plastic or airbrushed smoothness. No beauty filter, no slimming, no reshaping.",
  lighting:
    "Lighting: make the light physically consistent — one coherent key light with matching shadows and reflections, natural contrast and believable colour temperature. Expose darker skin properly so its depth, warmth and undertones read richly; never grey it out, wash it out or crush it into shadow.",
  anatomy:
    "Anatomy: correct hands (five fingers, natural joints and nails), eyes (matching irises, natural catchlights, aligned gaze), teeth, ears and limbs, without changing pose or expression.",
  artifacts:
    "Artefacts: remove AI tells — warped or repeating patterns, melted jewellery or fabric, impossible geometry, garbled lettering, over-sharpened halos and painterly smearing. Keep legible real text exactly as written.",
};

/** Instructions for the image editor. Identity preservation always outranks enhancement. */
export function buildImagePrompt(opts: ImageOptions): string {
  const focus = opts.focus.length ? opts.focus : (Object.keys(IMAGE_FOCUS) as (keyof typeof IMAGE_FOCUS)[]);
  return [
    "Edit this AI-generated image so it looks like a natural, high-quality photograph of exactly the same scene.",
    "",
    "PRESERVE — these rules override everything else:",
    "- Every person's identity: face shape, features, proportions, age, expression and gaze. Do not beautify, slim, de-age or idealise anyone.",
    "- Skin tone exactly as it is. Never lighten, darken, desaturate or shift undertones. Darker skin must stay its true depth.",
    "- African features and hair as they are: nose and lip shape, hair texture (coils, kinks, braids, locs, twists), hairline and style.",
    "- Pose, clothing, accessories, cultural dress and patterns, composition, framing, camera angle, background layout and all objects.",
    "- Do not add or remove people or objects, and do not add text, logos, watermarks or borders.",
    "",
    "IMPROVE:",
    ...focus.map((f) => `- ${FOCUS_RULES[f]}`),
    "",
    `Strength — ${STRENGTH[opts.strength]}`,
    "",
    "Output a single photorealistic image at the same framing.",
  ].join("\n");
}
