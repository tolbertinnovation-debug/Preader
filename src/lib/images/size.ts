/**
 * Picks an output size matching the input's aspect ratio for models that accept
 * arbitrary WIDTHxHEIGHT: both sides multiples of 16, aspect between 1:3 and 3:1,
 * longest edge at most `maxEdge`.
 */
export function targetSize(width: number, height: number, maxEdge = 2048): string {
  let w = width;
  let h = height;
  const ratio = w / h;
  if (ratio > 3) w = h * 3;
  if (ratio < 1 / 3) h = w * 3;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const round16 = (n: number) => Math.max(256, Math.round((n * scale) / 16) * 16);
  return `${round16(w)}x${round16(h)}`;
}

/** Models that accept arbitrary sizes; others get "auto". */
export function supportsCustomSize(model: string): boolean {
  return /^gpt-image-2/.test(model);
}
