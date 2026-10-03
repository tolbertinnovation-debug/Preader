// Shared between client and server: Image Humanizer controls and limits.

export const IMAGE_STRENGTHS = {
  1: { label: "Subtle", hint: "Gentle clean-up. Keeps almost every pixel." },
  2: { label: "Balanced", hint: "Natural texture and light; fixes obvious flaws." },
  3: { label: "Strong", hint: "Thorough photographic rework of AI artefacts." },
} as const;
export type ImageStrength = 1 | 2 | 3;

export const IMAGE_FOCUS = {
  skin: { label: "Skin texture", hint: "Real pores and natural variation — no plastic smoothing." },
  lighting: { label: "Lighting", hint: "One believable light source, true exposure for every skin tone." },
  anatomy: { label: "Anatomy", hint: "Hands, fingers, eyes, teeth and ears." },
  artifacts: { label: "AI artefacts", hint: "Warped patterns, melted details, garbled text, halos." },
} as const;
export type ImageFocus = keyof typeof IMAGE_FOCUS;

export type ImageOptions = { strength: ImageStrength; focus: ImageFocus[] };

export const DEFAULT_IMAGE_OPTIONS: ImageOptions = { strength: 2, focus: ["skin", "lighting", "anatomy", "artifacts"] };

export const IMAGE_LIMITS = {
  /** Vercel rejects request bodies over 4.5 MB; the browser compresses below this first. */
  maxUploadBytes: 4 * 1024 * 1024,
  /** Longest edge sent for editing; also the output resolution. */
  maxEdge: 2048,
  minEdge: 256,
  accept: ["image/jpeg", "image/png", "image/webp"],
};
