// Reads the metadata an image carries about how it was made: EXIF, XMP (including
// IPTC Digital Source Type), and generator tags written by AI image tools.
// Metadata is easy to remove or edit, so findings here are evidence, never proof.
import { inflateSync } from "node:zlib";
import exifr from "exifr";

export type DetectImageKind = "jpeg" | "png" | "webp" | "heic" | "avif";

export const DETECT_IMAGE_MIME: Record<DetectImageKind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  avif: "image/avif",
};

/** Identifies the format from magic bytes only — never from the file name or browser-supplied type. */
export function sniffDetectImage(buf: Uint8Array): DetectImageKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => buf[i] === b)) return "png";
  const ascii = (from: number, to: number) => String.fromCharCode(...buf.subarray(from, to));
  if (buf.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (buf.length >= 16 && ascii(4, 8) === "ftyp") {
    const boxSize = Math.min(buf.length, (buf[0]! << 24) | (buf[1]! << 16) | (buf[2]! << 8) | buf[3]!, 256);
    const brands: string[] = [ascii(8, 12)];
    for (let i = 16; i + 4 <= boxSize; i += 4) brands.push(ascii(i, i + 4));
    if (brands.some((b) => b === "avif" || b === "avis")) return "avif";
    if (brands.some((b) => ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(b))) return "heic";
  }
  return null;
}

/** IPTC Digital Source Type vocabulary (https://cv.iptc.org/newscodes/digitalsourcetype/). */
export const SOURCE_TYPES: Record<string, { label: string; group: "ai" | "ai_edit" | "capture" | "human" | "other" }> = {
  trainedAlgorithmicMedia: { label: "Created using generative AI", group: "ai" },
  compositeWithTrainedAlgorithmicMedia: { label: "Edited or combined with generative AI", group: "ai_edit" },
  algorithmicallyEnhanced: { label: "Enhanced by an algorithm", group: "other" },
  algorithmicMedia: { label: "Made by a non-AI algorithm", group: "other" },
  compositeSynthetic: { label: "Composite including synthetic elements", group: "other" },
  dataDrivenMedia: { label: "Generated from data", group: "other" },
  virtualRecording: { label: "Recording of a virtual scene", group: "other" },
  screenCapture: { label: "Screen capture", group: "other" },
  composite: { label: "Composite of several elements", group: "other" },
  digitalCapture: { label: "Captured by a digital camera", group: "capture" },
  computationalCapture: { label: "Captured by a camera with computational processing", group: "capture" },
  compositeCapture: { label: "Composite of camera captures", group: "capture" },
  negativeFilm: { label: "Scanned from film negative", group: "capture" },
  positiveFilm: { label: "Scanned from slide film", group: "capture" },
  print: { label: "Scanned from a print", group: "capture" },
  digitalCreation: { label: "Created by a person using software", group: "human" },
  digitalArt: { label: "Created by a person using software", group: "human" },
  humanEdits: { label: "Edited by a person", group: "human" },
  minorHumanEdits: { label: "Minor edits by a person", group: "human" },
};

export function sourceTypeName(uriOrName: string): string {
  return uriOrName.split("/").pop()!.trim();
}

/**
 * Software names of generative-AI image tools, matched case-insensitively as whole words.
 * The flag marks names that are unambiguous enough to trust in free-text fields like
 * descriptions; names such as “Firefly” or “Runway” are only trusted in software fields.
 */
const AI_TOOLS: [RegExp, string, boolean][] = [
  [/\bmidjourney\b/i, "Midjourney", true],
  [/\bdall[\s·\-–]?e\b/i, "DALL·E", true],
  [/\bgpt[\s-]?image\b|\bgpt-4o\b|\bchatgpt\b/i, "OpenAI ChatGPT / GPT Image", false],
  [/\bsora\b/i, "OpenAI Sora", false],
  [/\bstable[\s-]?diffusion\b|\bsdxl\b|\bdreamstudio\b/i, "Stable Diffusion", true],
  [/\bcomfyui\b/i, "ComfyUI", true],
  [/\bautomatic1111\b|\bstable-diffusion-webui\b/i, "AUTOMATIC1111", true],
  [/\binvokeai\b/i, "InvokeAI", true],
  [/\bfooocus\b/i, "Fooocus", true],
  [/\bnovelai\b/i, "NovelAI", true],
  [/\bfirefly\b/i, "Adobe Firefly", false],
  [/\bimagen\b/i, "Google Imagen", false],
  [/\bmade with google ai\b|\bnano[\s-]?banana\b/i, "Google AI", true],
  [/\bideogram\b/i, "Ideogram", true],
  [/\bleonardo\.ai\b|\bleonardo ai\b/i, "Leonardo.Ai", true],
  [/\bflux\.1\b|\bblack forest labs\b/i, "FLUX (Black Forest Labs)", false],
  [/\bbing image creator\b|\bimage creator from (?:microsoft )?designer\b/i, "Microsoft Image Creator", true],
  [/\bgrok\b|\baurora\b.*\bx\.?ai\b/i, "xAI Grok", false],
  [/\bplayground ?ai\b/i, "Playground AI", false],
  [/\brecraft\b/i, "Recraft", false],
  [/\bseedream\b|\bdreamina\b/i, "Seedream / Dreamina", true],
  [/\bnightcafe\b/i, "NightCafe", true],
  [/\bcraiyon\b/i, "Craiyon", true],
  [/\bstarryai\b/i, "StarryAI", true],
  [/\bartbreeder\b/i, "Artbreeder", true],
  [/\brunway(?:ml)?\b/i, "Runway", false],
  [/\bkling\b/i, "Kling", false],
  [/\bcivitai\b/i, "Civitai", true],
];

export function matchAiTool(value: string, freeText = false): string | null {
  for (const [re, name, unambiguous] of AI_TOOLS) if ((unambiguous || !freeText) && re.test(value)) return name;
  return null;
}

export type ImageMeta = {
  width: number | null;
  height: number | null;
  camera: { make: string | null; model: string | null; lens: string | null; takenAt: string | null; exposure: boolean } | null;
  software: string[];
  hasGps: boolean;
  /** IPTC digital source types declared in XMP, by name. */
  sourceTypes: string[];
  aiTools: { field: string; value: string; tool: string }[];
  /** Generation settings (prompts, samplers, workflows) left by AI tools. */
  generation: { field: string; preview: string }[];
  /** Short human-readable rows for the report. */
  rows: [string, string][];
};

const MAX_TEXT = 1_000_000;

function readPngText(buf: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let p = 8;
  while (p + 12 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("latin1", p + 4, p + 8);
    const data = buf.subarray(p + 8, Math.min(buf.length, p + 8 + len));
    p += 12 + len;
    try {
      if (type === "tEXt") {
        const z = data.indexOf(0);
        if (z > 0) out[data.toString("latin1", 0, z)] = data.toString("latin1", z + 1);
      } else if (type === "zTXt") {
        const z = data.indexOf(0);
        if (z > 0) out[data.toString("latin1", 0, z)] = inflateSync(data.subarray(z + 2), { maxOutputLength: MAX_TEXT }).toString("latin1");
      } else if (type === "iTXt") {
        const z = data.indexOf(0);
        if (z <= 0) continue;
        const key = data.toString("latin1", 0, z);
        const compressed = data[z + 1] === 1;
        const langEnd = data.indexOf(0, z + 3);
        const transEnd = langEnd >= 0 ? data.indexOf(0, langEnd + 1) : -1;
        if (transEnd < 0) continue;
        const body = data.subarray(transEnd + 1);
        out[key] = (compressed ? inflateSync(body, { maxOutputLength: MAX_TEXT }) : body).toString("utf8");
      } else if (type === "IEND") {
        break;
      }
    } catch {
      // A malformed or oversized chunk is skipped rather than failing the whole analysis.
    }
  }
  return out;
}

function findXmp(buf: Buffer, pngText: Record<string, string>): string {
  const parts: string[] = [];
  if (pngText["XML:com.adobe.xmp"]) parts.push(pngText["XML:com.adobe.xmp"]);
  const open = Buffer.from("<x:xmpmeta");
  const close = Buffer.from("</x:xmpmeta>");
  let from = 0;
  for (let n = 0; n < 8; n++) {
    const s = buf.indexOf(open, from);
    if (s < 0) break;
    const e = buf.indexOf(close, s);
    if (e < 0) break;
    parts.push(buf.toString("utf8", s, e + close.length));
    from = e + close.length;
  }
  return parts.join("\n");
}

function xmpValues(xmp: string, name: string): string[] {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const out: string[] = [];
  for (const m of xmp.matchAll(new RegExp(`${esc}="([^"]*)"`, "g"))) out.push(m[1]!);
  for (const m of xmp.matchAll(new RegExp(`<${esc}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc}>`, "g"))) {
    const inner = m[1]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (inner) out.push(inner);
  }
  return out.map(decodeEntities).filter(Boolean);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function dimensions(buf: Buffer, kind: DetectImageKind): { width: number; height: number } | null {
  try {
    if (kind === "png" && buf.length >= 24) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (kind === "jpeg") {
      let p = 2;
      while (p + 9 < buf.length) {
        if (buf[p] !== 0xff) return null;
        const marker = buf[p + 1]!;
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
          p += 2;
          continue;
        }
        const len = buf.readUInt16BE(p + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: buf.readUInt16BE(p + 5), width: buf.readUInt16BE(p + 7) };
        }
        p += 2 + len;
      }
    }
    if (kind === "webp" && buf.length >= 30) {
      const chunk = buf.toString("latin1", 12, 16);
      if (chunk === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (chunk === "VP8L") {
        const b = buf.readUInt32LE(21);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
    }
    if (kind === "heic" || kind === "avif") {
      const at = buf.indexOf("ispe", 0, "latin1");
      if (at > 0 && at + 16 <= buf.length) return { width: buf.readUInt32BE(at + 8), height: buf.readUInt32BE(at + 12) };
    }
  } catch {
    /* fall through */
  }
  return null;
}

function text(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (v instanceof Uint8Array) return decodeUserComment(v);
  const s = String(v).replace(/\0+$/g, "").trim();
  return s ? s.slice(0, 500) : null;
}

/** EXIF UserComment starts with an 8-byte charset code (ASCII, UNICODE or JIS). */
function decodeUserComment(bytes: Uint8Array): string | null {
  const b = Buffer.from(bytes);
  const code = b.toString("latin1", 0, 8);
  const body = b.subarray(8);
  let s: string;
  if (code.startsWith("UNICODE")) {
    // Often UTF-16BE despite the spec's ambiguity; pick whichever decodes to more ASCII.
    const be = Buffer.from(body).swap16().toString("utf16le");
    const le = body.toString("utf16le");
    const ascii = (x: string) => (x.match(/[\x20-\x7e]/g) ?? []).length;
    s = ascii(be) >= ascii(le) ? be : le;
  } else {
    s = (code.startsWith("ASCII") ? body : b).toString("utf8");
  }
  s = s.replace(/\0+/g, "").trim();
  return s ? s.slice(0, MAX_TEXT) : null;
}

function preview(s: string): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > 180 ? `${one.slice(0, 180)}…` : one;
}

const SD_PARAMS = /(?:^|\n|,\s*)(?:Steps|Sampler|CFG scale|Seed|Model hash|Negative prompt)\s*:/i;

export async function readImageMeta(buf: Buffer, kind: DetectImageKind): Promise<ImageMeta> {
  const pngText = kind === "png" ? readPngText(buf) : {};
  const xmp = findXmp(buf, pngText);

  let exif: Record<string, unknown> = {};
  try {
    exif =
      ((await exifr.parse(buf, {
        tiff: true,
        exif: true,
        gps: true,
        ifd1: false,
        interop: false,
        xmp: false,
        icc: false,
        iptc: true,
        jfif: false,
        ihdr: false,
        userComment: true,
        translateValues: false,
        reviveValues: true,
        mergeOutput: true,
      })) as Record<string, unknown> | undefined) ?? {};
  } catch {
    exif = {};
  }

  const software = new Set<string>();
  const aiTools: ImageMeta["aiTools"] = [];
  const generation: ImageMeta["generation"] = [];
  const rows: [string, string][] = [];

  const consider = (field: string, value: string | null, freeText = false) => {
    if (!value) return;
    const tool = matchAiTool(value, freeText);
    if (tool && !aiTools.some((t) => t.field === field && t.tool === tool)) aiTools.push({ field, value: preview(value), tool });
  };

  const make = text(exif.Make);
  const model = text(exif.Model);
  const sw = text(exif.Software);
  const artist = text(exif.Artist);
  const description = text(exif.ImageDescription);
  const userComment = text(exif.UserComment);
  const takenAt = text(exif.DateTimeOriginal ?? exif.CreateDate);
  const lens = text(exif.LensModel);
  const exposure = exif.ExposureTime != null || exif.FNumber != null || exif.ISO != null;
  const hasGps = exif.latitude != null || exif.GPSLatitude != null;
  if (sw) software.add(sw);
  for (const [f, v, free] of [
    ["EXIF Software", sw, false],
    ["EXIF Make", make, false],
    ["EXIF Model", model, false],
    ["IPTC Credit", text(exif.Credit), false],
    ["EXIF Artist", artist, true],
    ["EXIF Image Description", description, true],
    ["IPTC By-line", text(exif.Byline), true],
  ] as const) {
    consider(f, v, free);
  }
  if (userComment) {
    consider("EXIF User Comment", userComment, true);
    if (SD_PARAMS.test(userComment)) generation.push({ field: "EXIF User Comment", preview: preview(userComment) });
  }

  // PNG text chunks written by Stable Diffusion front-ends, ComfyUI, InvokeAI, NovelAI and others.
  for (const [key, value] of Object.entries(pngText)) {
    if (key === "XML:com.adobe.xmp") continue;
    const k = key.toLowerCase();
    if (k === "software" || k === "source") software.add(preview(value));
    if (k === "software" || k === "source") consider(`PNG “${key}”`, value);
    else if (["description", "comment", "author", "title"].includes(k)) consider(`PNG “${key}”`, value, true);
    const looksGenerated =
      (k === "parameters" && SD_PARAMS.test(value)) ||
      ((k === "prompt" || k === "workflow") && /^\s*[{[]/.test(value) && /class_type|"nodes"|"inputs"/.test(value)) ||
      ["invokeai_metadata", "invokeai_graph", "sd-metadata", "dream", "generation_data"].includes(k) ||
      (k === "comment" && /"(?:steps|sampler|n_samples|uc|scale)"\s*:/.test(value));
    if (looksGenerated) generation.push({ field: `PNG “${key}”`, preview: preview(value) });
  }

  const sourceTypes = new Set<string>();
  if (xmp) {
    for (const m of xmp.matchAll(/digitalsourcetype\/([A-Za-z]+)/gi)) {
      const name = Object.keys(SOURCE_TYPES).find((n) => n.toLowerCase() === m[1]!.toLowerCase());
      if (name) sourceTypes.add(name);
    }
    for (const f of ["xmp:CreatorTool", "tiff:Software", "photoshop:Credit", "Iptc4xmpExt:AISystemUsed", "dc:creator", "dc:description"]) {
      for (const v of xmpValues(xmp, f)) {
        if (f === "xmp:CreatorTool" || f === "tiff:Software") software.add(preview(v));
        consider(`XMP ${f}`, v, f === "dc:creator" || f === "dc:description");
      }
    }
    for (const v of xmpValues(xmp, "Iptc4xmpExt:AIPromptInformation")) generation.push({ field: "XMP AI prompt", preview: preview(v) });
  }

  const dims = dimensions(buf, kind);
  const camera = make || model ? { make, model, lens, takenAt, exposure } : null;

  if (camera) rows.push(["Camera", [make, model].filter(Boolean).join(" ")]);
  if (lens) rows.push(["Lens", lens]);
  if (takenAt) rows.push(["Date taken (EXIF)", takenAt]);
  for (const s of software) rows.push(["Software", s]);
  for (const t of sourceTypes) rows.push(["Digital source type (XMP)", SOURCE_TYPES[t]?.label ?? t]);
  if (hasGps) rows.push(["Location", "GPS coordinates present (not shown)"]);

  return {
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    camera,
    software: [...software],
    hasGps,
    sourceTypes: [...sourceTypes],
    aiTools,
    generation,
    rows,
  };
}
