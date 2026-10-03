import { IMAGE_FOCUS, type ImageOptions } from "./options";

export const IMAGE_PROMPT_VERSION = "2026-10-03.2";

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
    "Artefacts: remove AI tells — warped or repeating patterns, melted jewellery or fabric, impossible geometry, garbled lettering, over-sharpened halos and painterly smearing. Keep all text exactly as written.",
};

const PEOPLE_RULES = [
  "- Every person's identity: face shape, features, proportions, age, expression and gaze. Do not beautify, slim, de-age or idealise anyone.",
  "- Skin tone exactly as it is. Never lighten, darken, desaturate or shift undertones. Darker skin must stay its true depth.",
  "- African features and hair as they are: nose and lip shape, hair texture (coils, kinks, braids, locs, twists), hairline and style.",
  "- Pose, clothing, accessories, cultural dress and patterns.",
];

const SUBJECT_RULES: Record<ImageOptions["subject"], { intro: string; rules: string[] }> = {
  people: {
    intro: "The subject is one or more people.",
    rules: PEOPLE_RULES,
  },
  product: {
    intro: "The subject is a product or object.",
    rules: [
      "- The product's exact shape, proportions, colours, materials and finish.",
      "- All branding, labels, logos and printed text on it, exactly as they appear.",
      "- If people appear, every person rule below still applies:",
      ...PEOPLE_RULES,
    ],
  },
  scene: {
    intro: "The subject is a place: a building, street, landscape or interior.",
    rules: [
      "- The layout, architecture, landmarks, signage, vegetation and every object in the scene.",
      "- If people appear, every person rule below still applies:",
      ...PEOPLE_RULES,
    ],
  },
  graphic: {
    intro: "The subject is a designed graphic (a poster, flyer or social-media post). Only its photographic elements should change.",
    rules: [
      "- Every word, number, price, phone number, email address and web address exactly as it appears. Do not rewrite, correct, translate, add or remove any text.",
      "- Logos, icons, layout, colours, typography, borders and the position of every element.",
      "- If people appear, every person rule below still applies:",
      ...PEOPLE_RULES,
    ],
  },
};

/** Instructions for the image editor. Preserving the intended subject always outranks enhancement. */
export function buildImagePrompt(opts: ImageOptions): string {
  const focus = opts.focus.length ? opts.focus : (Object.keys(IMAGE_FOCUS) as (keyof typeof IMAGE_FOCUS)[]);
  const subject = SUBJECT_RULES[opts.subject] ?? SUBJECT_RULES.people;
  return [
    opts.subject === "graphic"
      ? "Edit this AI-generated graphic so its photographic elements look natural and high quality, keeping the design itself unchanged."
      : "Edit this AI-generated image so it looks like a natural, high-quality photograph of exactly the same scene.",
    subject.intro,
    "",
    "PRESERVE — these rules override everything else:",
    ...subject.rules,
    "- Composition, framing, camera angle and background layout.",
    "- Do not add or remove people or objects, and do not add text, logos, watermarks or borders.",
    "",
    "IMPROVE:",
    ...focus.map((f) => `- ${FOCUS_RULES[f]}`),
    "",
    `Strength — ${STRENGTH[opts.strength]}`,
    "",
    opts.subject === "graphic" ? "Output the same graphic at the same framing." : "Output a single photorealistic image at the same framing.",
  ].join("\n");
}
