import "server-only";
import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { ORG } from "@/lib/brand";
import { VERDICT_LABEL, type DetectResult, type Evidence, type Highlight, type ImageResult, type TextResult } from "./types";

const FONT = "Calibri";
const BORDER = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } as const;
const TABLE_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideHorizontal: BORDER, insideVertical: BORDER };
const TONE_FILL: Record<string, string> = { ai: "FDE2D6", human: "DDF0E2", neutral: "ECEAE6", warning: "FFF1C7" };
const pct = (n: number) => `${Math.round(n * 100)}%`;

const p = (text: string, opts: { bold?: boolean; size?: number; color?: string; after?: number; italics?: boolean } = {}) =>
  new Paragraph({
    spacing: { after: opts.after ?? 120 },
    children: [new TextRun({ text, font: FONT, size: opts.size ?? 21, bold: opts.bold, color: opts.color, italics: opts.italics })],
  });
const h = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new TextRun({ text, font: FONT })] });

function cell(text: string, opts: { fill?: string; bold?: boolean; width?: number; color?: string } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.fill ? { type: ShadingType.CLEAR, color: "auto", fill: opts.fill } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text, font: FONT, size: 19, bold: opts.bold, color: opts.color })] })],
  });
}

function table(header: string[], rows: string[][], widths: number[], fills?: (string | undefined)[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({ tableHeader: true, children: header.map((t, i) => cell(t, { fill: "1F3D2B", bold: true, color: "FFFFFF", width: widths[i] })) }),
      ...rows.map((r, ri) => new TableRow({ children: r.map((t, i) => cell(t, { width: widths[i], fill: i === 0 ? fills?.[ri] : undefined })) })),
    ],
  });
}

const DIRECTION: Record<Evidence["direction"], string> = { ai: "Towards AI", human: "Towards human", neutral: "Neither way", warning: "Integrity warning" };

function evidenceTable(evidence: Evidence[]) {
  if (!evidence.length) return [p("No specific evidence was found.")];
  return [
    table(
      ["Finding", "Source", "Points", "Strength"],
      evidence.map((e) => [`${e.title}. ${e.detail}`, e.source, DIRECTION[e.direction], e.strength]),
      [58, 16, 14, 12],
      evidence.map((e) => TONE_FILL[e.direction]),
    ),
  ];
}

function highlightedText(r: TextResult) {
  // Merge overlapping highlights by priority so each character is shaded once.
  const rank: Record<Highlight["kind"], number> = { hidden: 4, artifact: 3, model: 2, phrase: 1 };
  const fill: Record<Highlight["kind"], string> = { hidden: "FFD166", artifact: "F4A3A3", model: "F7C9B6", phrase: "D9E2F3" };
  const marks: (Highlight["kind"] | null)[] = new Array(r.text.length).fill(null);
  for (const hl of r.highlights) {
    for (let i = hl.start; i < hl.end && i < marks.length; i++) if (!marks[i] || rank[hl.kind] > rank[marks[i]!]) marks[i] = hl.kind;
  }
  const paragraphs: Paragraph[] = [];
  let runs: TextRun[] = [];
  let i = 0;
  const flush = () => {
    paragraphs.push(new Paragraph({ spacing: { after: 160, line: 300 }, children: runs }));
    runs = [];
  };
  while (i < r.text.length) {
    if (r.text[i] === "\n") {
      if (runs.length) flush();
      i++;
      continue;
    }
    let j = i;
    while (j < r.text.length && r.text[j] !== "\n" && marks[j] === marks[i]) j++;
    const kind = marks[i];
    runs.push(
      new TextRun({
        text: r.text.slice(i, j).replace(/[​-‏⁠-⁤﻿]/g, "⟦·⟧"),
        font: FONT,
        size: 21,
        shading: kind ? { type: ShadingType.CLEAR, color: "auto", fill: fill[kind] } : undefined,
      }),
    );
    i = j;
  }
  if (runs.length) flush();
  return paragraphs;
}

function textSections(r: TextResult) {
  const flagged = r.highlights.filter((x) => x.kind === "model").sort((a, b) => (b.ai ?? 0) - (a.ai ?? 0));
  const out = [];
  out.push(h("Highlighted passages"));
  if (flagged.length) {
    out.push(
      table(
        ["Passage", "AI likelihood"],
        flagged.slice(0, 40).map((x) => [r.text.slice(x.start, x.end), x.ai === null ? "—" : pct(x.ai)]),
        [85, 15],
      ),
    );
  } else {
    out.push(p(r.score ? "The detection model did not flag any sentence at 50% or above." : "No detection model result, so no sentences were scored."));
  }
  out.push(h("Full text with highlights"));
  out.push(p("Key: orange = sentence the model scored 50%+ AI · red = leftover chatbot wording · yellow = hidden characters (shown as ⟦·⟧) · blue = stock phrase.", { size: 18, italics: true }));
  out.push(...highlightedText(r));
  return out;
}

function imageSections(r: ImageResult) {
  const out = [];
  out.push(h("File"));
  out.push(
    table(
      ["Property", "Value"],
      [
        ["File name", r.file.name],
        ["Type", r.file.type],
        ["Size", `${(r.file.bytes / 1024).toFixed(0)} KB`],
        ["SHA-256", r.file.sha256],
        ...r.metadata,
      ],
      [30, 70],
    ),
  );
  out.push(h("Content Credentials (C2PA)"));
  if (r.credentials) {
    const c = r.credentials;
    out.push(p(`Status: ${c.state === "trusted" ? "Valid, trusted signer" : c.state === "valid" ? "Valid signature, signer not on the C2PA Trust List" : "Failed verification"}.`, { bold: true }));
    out.push(p(c.trustNote));
    for (const f of c.failures) out.push(p(`• ${f}`));
  } else {
    out.push(p("None found in this file. This is common and is not evidence of human creation."));
  }
  return out;
}

export async function detectionReportDocx(r: DetectResult): Promise<Buffer> {
  const verdict = VERDICT_LABEL[r.verdict];
  const scoreLine = r.score
    ? `Detection model score: ${pct(r.score.ai)} AI likelihood (${r.score.provider}${r.score.mixed !== null ? `; mixed ${pct(r.score.mixed)}` : ""}${r.score.human !== null ? `; human ${pct(r.score.human)}` : ""}${r.score.confidence ? `; model confidence ${r.score.confidence}` : ""}).`
    : "No score: no detection model result was available. PanPen never estimates a score from metadata or writing patterns.";

  const doc = new Document({
    creator: `PanPen (${ORG.name})`,
    title: "PanPen AI Content Detection Report",
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `PanPen · ${ORG.poweredBy} · Report ${r.id}`, font: FONT, size: 16, color: "6B6B6B" })],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: "AI Content Detection Report", font: FONT })] }),
          p(`PanPen · ${ORG.poweredBy}`, { color: "1F3D2B", bold: true }),
          p(`Report ID ${r.id} · ${r.kind === "text" ? `Text, ${r.words.toLocaleString()} words` : `Image, ${r.file.name}`} · Generated ${new Date(r.createdAt).toUTCString()}`, { size: 18, color: "6B6B6B", after: 240 }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: TABLE_BORDERS,
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    shading: { type: ShadingType.CLEAR, color: "auto", fill: TONE_FILL[r.verdict === "inconclusive" ? "neutral" : r.verdict === "tampered" ? "warning" : ["likely_human", "camera_capture", "likely_not_ai"].includes(r.verdict) ? "human" : "ai"] },
                    margins: { top: 140, bottom: 140, left: 160, right: 160 },
                    children: [
                      new Paragraph({ children: [new TextRun({ text: `Result: ${verdict}`, font: FONT, size: 30, bold: true })] }),
                      new Paragraph({ spacing: { before: 60 }, children: [new TextRun({ text: r.headline, font: FONT, size: 22, bold: true })] }),
                      new Paragraph({ spacing: { before: 60 }, children: [new TextRun({ text: r.summary, font: FONT, size: 21 })] }),
                      new Paragraph({ spacing: { before: 60 }, children: [new TextRun({ text: scoreLine, font: FONT, size: 20, italics: true })] }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          h("Evidence"),
          ...evidenceTable(r.evidence),
          ...(r.kind === "text" ? textSections(r) : imageSections(r)),
          h("Checks performed"),
          table(
            ["Check", "Outcome"],
            r.checks.map((c) => [c.name, c.message]),
            [35, 65],
          ),
          h("Limitations"),
          ...r.caveats.map((c) => p(`• ${c}`)),
          p(
            "This report records what PanPen's checks found at the time of analysis. It is not a certificate of authorship or authenticity and must not be the sole basis for any academic, legal or disciplinary decision.",
            { italics: true, size: 18, color: "6B6B6B" },
          ),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
