// Accuracy and false-positive evaluation for the AI Content Detector.
//
//   npm run eval:detect
//
// Runs every labelled sample through the same code the app uses. Set GPTZERO_API_KEY
// and/or SIGHTENGINE_API_USER + SIGHTENGINE_API_SECRET to include live detection models.
// Add your own samples with EVAL_TEXT_DIR=/path (sub-folders human/, ai/, edited/, mixed/
// holding .txt files) — modern writing from your own community is the best test of
// false positives. Results are written to eval/RESULTS.md.
import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import corpus from "./corpus/text.json";
import images from "./fixtures/images.json";
import { readContentCredentials } from "@/lib/detect/c2pa";
import { buildImageResult } from "@/lib/detect/image";
import { DETECT_IMAGE_MIME, readImageMeta, sniffDetectImage } from "@/lib/detect/image-meta";
import { detectImageSightengine, detectTextGptZero, gptZeroConfigured, sightengineConfigured } from "@/lib/detect/providers";
import { buildTextResult, type ModelOutcome, type TextModelOutput } from "@/lib/detect/text";
import type { TextResult, TextVerdict } from "@/lib/detect/types";

type Sample = { id: string; label: string; variety: string; text: string; aiParts?: string[] };
const meta = { id: "EVAL", createdAt: new Date().toISOString() };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");

function loadSamples(): Sample[] {
  const samples: Sample[] = corpus.items.map((i) => ({ ...i }));
  const dir = process.env.EVAL_TEXT_DIR;
  if (dir) {
    for (const label of ["human", "ai", "edited", "mixed"]) {
      const sub = path.join(dir, label);
      if (!fs.existsSync(sub)) continue;
      for (const f of fs.readdirSync(sub).filter((n) => n.endsWith(".txt"))) {
        samples.push({ id: `custom-${label}-${f}`, label, variety: "Your samples", text: fs.readFileSync(path.join(sub, f), "utf8").trim() });
      }
    }
  }
  return samples;
}

const african = (s: Sample) => /Liberian|Nigerian|Ghanaian|West African|South African|Your samples/.test(s.variety);

it("evaluates text and image detection", async () => {
  const lines: string[] = [];
  const log = (s = "") => {
    lines.push(s);
    console.log(s);
  };
  log(`# AI Content Detector evaluation`);
  log();
  log(`Run: ${meta.createdAt}`);
  log(`Text model: ${gptZeroConfigured() ? "GPTZero (live)" : "none connected"} · Image model: ${sightengineConfigured() ? "Sightengine (live)" : "none connected"}`);
  log();

  // ---------- Text ----------
  const samples = loadSamples();
  const results: { s: Sample; r: TextResult }[] = [];
  for (const s of samples) {
    const outcome: ModelOutcome<TextModelOutput> = gptZeroConfigured() ? await detectTextGptZero(s.text) : { status: "not_configured", name: "GPTZero", message: "not configured" };
    if (gptZeroConfigured()) await sleep(400);
    const r = buildTextResult(s.text, outcome, meta);
    results.push({ s, r });
    // Integrity: a score may only exist when a model actually returned one.
    if (outcome.status !== "ok") expect(r.score).toBeNull();
  }

  const verdicts: TextVerdict[] = ["likely_ai", "mixed", "likely_human", "inconclusive"];
  log(`## Text (${samples.length} samples)`);
  log();
  log(`| Group | n | Likely AI | Mixed | Likely human | Inconclusive |`);
  log(`|---|---|---|---|---|---|`);
  const groups: [string, (s: Sample) => boolean][] = [
    ["Human · African/Liberian English", (s) => s.label === "human" && african(s)],
    ["Human · other", (s) => s.label === "human" && !african(s)],
    ["AI · African English style", (s) => s.label === "ai" && african(s)],
    ["AI · Standard English", (s) => s.label === "ai" && !african(s)],
    ["Edited (human ideas, AI wording)", (s) => s.label === "edited"],
    ["Mixed (human + AI paragraphs)", (s) => s.label === "mixed"],
  ];
  for (const [name, test] of groups) {
    const g = results.filter((x) => test(x.s));
    if (!g.length) continue;
    log(`| ${name} | ${g.length} | ${verdicts.map((v) => g.filter((x) => x.r.verdict === v).length).join(" | ")} |`);
  }
  log();

  const human = results.filter((x) => x.s.label === "human");
  const ai = results.filter((x) => x.s.label === "ai");
  const fp = human.filter((x) => x.r.verdict === "likely_ai" || x.r.verdict === "mixed");
  const fpAfrican = fp.filter((x) => african(x.s));
  log(`- **False positives** (human text called AI or mixed): ${fp.length}/${human.length} (${pct(fp.length, human.length)}); African/Liberian English: ${fpAfrican.length}/${human.filter((x) => african(x.s)).length}`);
  log(`- **AI detected** (AI text called Likely AI or Mixed): ${ai.filter((x) => x.r.verdict === "likely_ai" || x.r.verdict === "mixed").length}/${ai.length}`);
  log(`- **AI missed** (AI text called Likely human): ${ai.filter((x) => x.r.verdict === "likely_human").length}/${ai.length}`);
  log(`- **Inconclusive**: ${results.filter((x) => x.r.verdict === "inconclusive").length}/${results.length}`);
  if (fp.length) log(`- False-positive samples: ${fp.map((x) => `${x.s.id} (${x.r.score ? Math.round(x.r.score.ai * 100) : "?"}%)`).join(", ")}`);

  // Sentence-level check on mixed documents: are the flagged sentences inside the AI part?
  const mixed = results.filter((x) => x.s.aiParts?.length && x.r.score);
  if (mixed.length) {
    let inAi = 0;
    let total = 0;
    for (const { s, r } of mixed) {
      const ranges = s.aiParts!.map((p) => {
        const at = s.text.indexOf(p);
        return [at, at + p.length] as const;
      });
      for (const h of r.highlights.filter((x) => x.kind === "model")) {
        total++;
        if (ranges.some(([a, b]) => h.start >= a && h.end <= b)) inAi++;
      }
    }
    log(`- **Mixed documents**: ${inAi}/${total} model-flagged sentences fall inside the AI-written part`);
  }

  // Why writing patterns never decide a result: how often they point to "AI" on human text.
  const patternAi = (x: { r: TextResult }) => x.r.evidence.some((e) => e.source === "Writing patterns" && e.direction === "ai");
  log(
    `- Writing-pattern signals pointed to AI on ${human.filter(patternAi).length}/${human.length} human samples and ${ai.filter(patternAi).length}/${ai.length} AI samples — too unreliable to use for verdicts, so PanPen shows them only as context.`,
  );
  log();
  log(`<details><summary>Per-sample results</summary>`);
  log();
  log(`| Sample | Label | Words | Verdict | AI score |`);
  log(`|---|---|---|---|---|`);
  for (const { s, r } of results) log(`| ${s.id} | ${s.label} | ${r.words} | ${r.verdict} | ${r.score ? `${Math.round(r.score.ai * 100)}%` : "—"} |`);
  log();
  log(`</details>`);
  log();

  // ---------- Images ----------
  log(`## Images (${images.items.length} fixtures)`);
  log();
  log(`| Fixture | Expected (no model) | Got | Model score |`);
  log(`|---|---|---|---|`);
  let correct = 0;
  for (const f of images.items) {
    const buf = fs.readFileSync(path.join(__dirname, "fixtures/images", f.file));
    const kind = sniffDetectImage(buf)!;
    const mime = DETECT_IMAGE_MIME[kind];
    const [m, c2pa, model] = await Promise.all([readImageMeta(buf, kind), readContentCredentials(buf, mime), detectImageSightengine(buf, mime)]);
    const r = buildImageResult({ file: { name: f.file, type: mime, bytes: buf.length, sha256: "", width: m.width, height: m.height }, meta: m, c2pa, model, ...meta });
    if (model.status !== "ok") expect(r.score).toBeNull();
    const ok = r.verdict === f.expect || (model.status === "ok" && r.basis === "model");
    if (r.verdict === f.expect) correct++;
    log(`| ${f.file} | ${f.expect} | ${r.verdict}${ok ? "" : " ✗"} | ${r.score ? `${Math.round(r.score.ai * 100)}%` : "—"} |`);
  }
  log();
  log(`Provenance checks matched the expected verdict on ${correct}/${images.items.length} fixtures.`);
  log();
  log(`## Limits of this evaluation`);
  log();
  log(
    `- Human samples are public-domain writing by African and Liberian authors (1789–1916), which is certainly human but older in style than today's writing. Measure false positives on modern writing with EVAL_TEXT_DIR before relying on the detector for decisions.`,
  );
  log(`- AI samples were written by one AI model; other models may be easier or harder to detect.`);
  log(`- Without a connected detection model every text result is Inconclusive by design: PanPen never turns writing patterns into a verdict or a score.`);

  fs.writeFileSync(path.join(__dirname, "RESULTS.md"), `${lines.join("\n")}\n`);
});
