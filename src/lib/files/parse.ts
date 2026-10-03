import "server-only";
import { LIMITS } from "../options";
import { HttpError } from "../http";
import { normalizeText } from "../text/segment";

export type ParsedFile = { text: string; title: string; truncated: boolean; kind: "txt" | "md" | "docx" | "pdf" };

/** Rejoins hard-wrapped lines (common in PDF extraction) into paragraphs. */
export function unwrapLines(raw: string): string {
  const text = raw.replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2");
  const blocks = text.split(/\n\s*\n/);
  return blocks
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length <= 1) return lines.join("");
      const lengths = lines.map((l) => l.length).sort((a, b) => a - b);
      const typical = lengths[Math.floor(lengths.length * 0.75)] ?? 80;
      let out = lines[0]!;
      for (let i = 1; i < lines.length; i++) {
        const prev = lines[i - 1]!;
        const line = lines[i]!;
        const isList = /^(?:[-*•▪◦]|\d+[.)])\s/.test(line);
        const paragraphEnd = /[.!?:"”)]$/.test(prev) && prev.length < typical * 0.8;
        out += isList || paragraphEnd ? `\n\n${line}` : ` ${line}`;
      }
      return out;
    })
    .join("\n\n");
}

function decodeText(buf: Buffer): string {
  if (buf.subarray(0, 4096).includes(0)) throw new HttpError(415, "binary", "That file doesn't look like plain text.");
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

export async function parseUpload(name: string, buf: Buffer): Promise<ParsedFile> {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const title = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 120) || "Uploaded document";
  let text: string;
  let kind: ParsedFile["kind"];

  if (ext === "docx") {
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new HttpError(415, "bad_file", "That .docx file appears to be damaged.");
    const mammoth = await import("mammoth");
    const res = await mammoth.extractRawText({ buffer: buf });
    text = res.value;
    kind = "docx";
  } else if (ext === "pdf") {
    if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new HttpError(415, "bad_file", "That PDF appears to be damaged.");
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const res = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(res.text) ? res.text : [res.text];
    text = unwrapLines(pages.join("\n\n"));
    kind = "pdf";
    if (text.replace(/\s/g, "").length < 20) {
      throw new HttpError(422, "scanned_pdf", "We couldn't find selectable text in this PDF. It may be a scanned image — try a .docx or text version.");
    }
  } else if (ext === "txt" || ext === "md" || ext === "markdown") {
    text = decodeText(buf);
    kind = ext === "txt" ? "txt" : "md";
  } else if (ext === "doc") {
    throw new HttpError(415, "unsupported", "Old .doc files aren't supported. Save it as .docx and upload again.");
  } else {
    throw new HttpError(415, "unsupported", "Upload a .docx, .pdf, .txt or .md file.");
  }

  text = normalizeText(text);
  let truncated = false;
  if (text.length > LIMITS.maxChars) {
    text = text.slice(0, LIMITS.maxChars).replace(/\s+\S*$/, "");
    truncated = true;
  }
  if (!text) throw new HttpError(422, "empty_file", "That file doesn't contain any text we could read.");
  return { text, title, truncated, kind };
}
