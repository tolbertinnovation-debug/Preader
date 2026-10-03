export type ImageKind = "jpeg" | "png" | "webp";

/** Identifies an image by its magic bytes — never by the client-supplied name or MIME type. */
export function sniffImage(buf: Uint8Array): ImageKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => buf[i] === b)) return "png";
  if (
    buf.length >= 12 &&
    String.fromCharCode(buf[0]!, buf[1]!, buf[2]!, buf[3]!) === "RIFF" &&
    String.fromCharCode(buf[8]!, buf[9]!, buf[10]!, buf[11]!) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}
