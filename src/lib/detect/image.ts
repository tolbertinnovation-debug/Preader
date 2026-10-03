// Combines Content Credentials, metadata and (optionally) a detection model into one
// image result. Pure: inputs are the outcomes of each check, so it is fully unit-tested.
//
// Order of trust: verified Content Credentials > declared metadata > detection model.
// Missing provenance is never treated as evidence of human creation.
import type { C2paOutcome } from "./c2pa";
import { SOURCE_TYPES, type ImageMeta } from "./image-meta";
import type { ModelOutcome } from "./text";
import { THRESHOLDS, type CheckStatus, type Evidence, type ImageResult, type ImageVerdict, type ModelScore } from "./types";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const group = (t: string) => SOURCE_TYPES[t]?.group;
const labels = (types: string[]) => types.map((t) => SOURCE_TYPES[t]?.label ?? t).join("; ");

export const IMAGE_CAVEATS = {
  missing:
    "Missing Content Credentials or metadata is normal: Facebook, WhatsApp, most social apps and screenshots remove them. Their absence is never evidence that an image is human-made.",
  metadata:
    "Ordinary metadata can be edited or faked. Signed Content Credentials are much harder to fake, but they record what the signing tool declared.",
  watermark:
    "PanPen can't read invisible watermarks such as Google SynthID. For images that may come from Google tools, also check with Google's own SynthID Detector.",
  model: "AI image detectors can be wrong, especially on small, heavily compressed, screenshotted or edited images.",
  general: "Never use this result on its own to accuse anyone or to make a high-stakes decision.",
};

type Input = {
  file: ImageResult["file"];
  meta: ImageMeta;
  c2pa: C2paOutcome;
  model: ModelOutcome<{ score: ModelScore }>;
  id: string;
  createdAt: string;
};

export function buildImageResult({ file, meta, c2pa, model, id, createdAt }: Input): ImageResult {
  const evidence: Evidence[] = [];
  const checks: CheckStatus[] = [];
  const caveats: string[] = [];
  // Mutable state object (rather than lets) so TypeScript doesn't narrow it across decide() calls.
  const out: { verdict: ImageVerdict; basis: ImageResult["basis"]; headline: string; summary: string } = {
    verdict: "inconclusive",
    basis: "none",
    headline: "Inconclusive",
    summary: "",
  };
  const decided = () => out.basis !== "none";
  const decide = (verdict: ImageVerdict, basis: ImageResult["basis"], headline: string, summary: string) => Object.assign(out, { verdict, basis, headline, summary });

  // 1. Content Credentials (C2PA)
  const credentials = c2pa.status === "found" ? c2pa.summary : null;
  if (c2pa.status === "found") {
    const cr = c2pa.summary;
    checks.push({ name: "Content Credentials (C2PA)", status: "ok", message: cr.state === "trusted" ? "Found and verified: valid, trusted signer." : cr.state === "valid" ? "Found and verified: valid signature, signer not on the trust list." : "Found, but they failed verification." });
    const signer = cr.signer ? ` signed by ${cr.signer}` : "";
    const types = c2pa.historySourceTypes;
    const hasAi = types.some((t) => group(t) === "ai");
    const hasAiEdit = types.some((t) => group(t) === "ai_edit");
    const capture = c2pa.activeSourceTypes.some((t) => group(t) === "capture");
    const agents = c2pa.aiAgents.length ? ` (${c2pa.aiAgents.join(", ")})` : "";

    if (!c2pa.claimSigned) {
      evidence.push({ id: "c2pa-broken", source: "Content Credentials", direction: "warning", strength: "strong", title: "Content Credentials failed verification", detail: cr.failures.join(" ") });
      decide("tampered", "content_credentials", "Content Credentials failed verification", "This image carries Content Credentials, but their signature does not verify, so nothing they claim can be relied on. The file may have been tampered with.");
    } else if (c2pa.contentChanged) {
      evidence.push({ id: "c2pa-changed", source: "Content Credentials", direction: "warning", strength: "strong", title: "Image changed after signing", detail: `The credentials${signer} are genuine, but the image data no longer matches what was signed.` });
      if (hasAi || hasAiEdit) {
        evidence.push({ id: "c2pa-ai", source: "Content Credentials", direction: "ai", strength: "strong", title: "Credentials declare generative AI", detail: `Declared: ${labels(types.filter((t) => group(t)?.startsWith("ai")))}${agents}.` });
        decide("likely_ai", "content_credentials", "Likely AI-generated: credentials say so, but the image was changed later", `Genuine Content Credentials${signer} declare that this image was ${hasAi ? "created" : "edited"} with generative AI. The image was modified afterwards (for example cropped or re-saved), so the credentials no longer cover the exact pixels.`);
      } else {
        decide("tampered", "content_credentials", "Image changed after its Content Credentials were signed", "The credentials are genuine, but the image was modified after signing, so they don't describe this exact file.");
      }
    } else if (hasAi) {
      evidence.push({ id: "c2pa-ai", source: "Content Credentials", direction: "ai", strength: "strong", title: "Credentials declare generative AI", detail: `Declared: ${labels(types.filter((t) => group(t) === "ai"))}${agents}. ${cr.trustNote}` });
      decide(
        "ai_generated",
        "content_credentials",
        cr.state === "trusted" ? "AI-generated: confirmed by Content Credentials" : "AI-generated: declared in Content Credentials",
        `This image's Content Credentials${signer} declare it was created using generative AI${agents}${
          c2pa.activeSourceTypes.includes("trainedAlgorithmicMedia") ? "" : `, then edited${cr.generator ? ` in ${cr.generator}` : ""}`
        }, and the file has not been changed since signing.${cr.state === "trusted" ? "" : " The signer isn't on the C2PA Trust List, so its identity isn't independently confirmed."}`,
      );
    } else if (hasAiEdit) {
      evidence.push({ id: "c2pa-ai-edit", source: "Content Credentials", direction: "ai", strength: "strong", title: "Credentials declare AI editing", detail: `Declared: ${labels(types.filter((t) => group(t) === "ai_edit"))}${agents}. ${cr.trustNote}` });
      decide("ai_edited", "content_credentials", "Edited with AI: declared in Content Credentials", `This image's Content Credentials${signer} declare that parts of it were made or changed with generative AI${agents}.`);
    } else if (capture && cr.state === "trusted") {
      evidence.push({ id: "c2pa-capture", source: "Content Credentials", direction: "human", strength: "strong", title: "Credentials record a camera capture", detail: `Declared: ${labels(c2pa.activeSourceTypes.filter((t) => group(t) === "capture"))}. ${cr.trustNote}` });
      decide("camera_capture", "content_credentials", "Camera capture: confirmed by Content Credentials", `A trusted signer${signer} recorded that this image was captured by a camera, and it hasn't been changed since. No generative AI is declared.`);
    } else {
      evidence.push({
        id: "c2pa-plain",
        source: "Content Credentials",
        direction: capture ? "human" : "neutral",
        strength: capture ? "moderate" : "info",
        title: capture ? "Credentials claim a camera capture" : "Credentials don't mention AI",
        detail: `${capture ? `Declared: ${labels(c2pa.activeSourceTypes)}. ` : `Recorded steps: ${cr.actions.join(", ") || "none listed"}. `}${cr.trustNote}${capture ? "" : " Credentials that don't mention AI are not proof that none was used."}`,
      });
    }
    if (c2pa.claimSigned && !c2pa.contentChanged && cr.failures.length && cr.state === "invalid") {
      evidence.push({ id: "c2pa-history", source: "Content Credentials", direction: "warning", strength: "weak", title: "Problem in the image's earlier history", detail: cr.failures.join(" ") });
    }
  } else if (c2pa.status === "remote") {
    let host = "an external server";
    try {
      host = new URL(c2pa.url).host;
    } catch {
      /* keep default */
    }
    checks.push({ name: "Content Credentials (C2PA)", status: "skipped", message: `The image points to credentials stored online at ${host}. PanPen doesn't fetch them, to protect your privacy and our servers.` });
    evidence.push({ id: "c2pa-remote", source: "Content Credentials", direction: "neutral", strength: "info", title: "Credentials stored online", detail: `This image links to Content Credentials hosted at ${host}. You can inspect them with the Content Authenticity Initiative's Inspect tool.` });
  } else if (c2pa.status === "none") {
    checks.push({ name: "Content Credentials (C2PA)", status: "none_found", message: "No Content Credentials in this file." });
  } else {
    checks.push({ name: "Content Credentials (C2PA)", status: "error", message: c2pa.message });
  }

  // 2. Metadata
  const aiTypes = meta.sourceTypes.filter((t) => group(t) === "ai");
  const aiEditTypes = meta.sourceTypes.filter((t) => group(t) === "ai_edit");
  const metaFindings = aiTypes.length + aiEditTypes.length + meta.aiTools.length + meta.generation.length;
  checks.push({
    name: "Metadata (EXIF, XMP, IPTC, PNG)",
    status: metaFindings || meta.camera || meta.software.length || meta.sourceTypes.length ? "ok" : "none_found",
    message: metaFindings ? "Found AI-related metadata." : meta.camera || meta.software.length ? "Read; no AI declarations found." : "No useful metadata in this file.",
  });
  if (aiTypes.length || aiEditTypes.length) {
    evidence.push({ id: "xmp-source", source: "Metadata", direction: "ai", strength: "moderate", title: "Metadata declares generative AI", detail: `IPTC Digital Source Type: ${labels([...aiTypes, ...aiEditTypes])}. Unsigned, so it could have been edited, but tools write this to label AI images.` });
  }
  for (const t of meta.aiTools) {
    evidence.push({ id: `tool-${t.field}`, source: "Metadata", direction: "ai", strength: "moderate", title: `AI tool named: ${t.tool}`, detail: `${t.field}: “${t.value}”.` });
  }
  if (meta.generation.length) {
    evidence.push({
      id: "generation",
      source: "Metadata",
      direction: "ai",
      strength: "strong",
      title: "AI generation settings embedded",
      detail: `${meta.generation.map((g) => g.field).join(", ")} contain image-generation settings (prompt, sampler, steps or workflow), e.g. “${meta.generation[0]!.preview}”.`,
    });
  }
  if (!decided()) {
    if (aiTypes.length || meta.generation.length) {
      decide("ai_generated", "metadata", "AI-generated: declared in metadata", `The file's metadata ${meta.generation.length ? "contains the settings used to generate it with an AI image tool" : "declares it was created with generative AI"}. Metadata isn't signed, so treat this as strong but not tamper-proof evidence.`);
    } else if (aiEditTypes.length) {
      decide("ai_edited", "metadata", "Edited with AI: declared in metadata", "The file's metadata declares that generative AI was used to edit or combine it. Metadata isn't signed, so it could have been altered.");
    } else if (meta.aiTools.length) {
      decide("likely_ai", "metadata", "Likely AI-generated: metadata names an AI tool", `The file's metadata names ${[...new Set(meta.aiTools.map((t) => t.tool))].join(", ")}, an AI image tool. Metadata isn't signed, so it could have been altered.`);
    }
  }
  if (meta.camera) {
    const cam = [meta.camera.make, meta.camera.model].filter(Boolean).join(" ");
    evidence.push({
      id: "camera",
      source: "Metadata",
      direction: "human",
      strength: "weak",
      title: `Camera details: ${cam}`,
      detail: `${meta.camera.takenAt ? `Taken ${meta.camera.takenAt.slice(0, 10)}. ` : ""}${meta.camera.exposure ? "Exposure settings recorded. " : ""}Consistent with a real photo, but EXIF can be copied onto any image, so this is weak evidence.`,
    });
  }
  if (meta.hasGps) {
    evidence.push({ id: "gps", source: "Metadata", direction: "neutral", strength: "info", title: "Contains GPS location", detail: "This image includes location data. PanPen doesn't show or store it, but consider removing it before sharing the photo publicly." });
  }

  // 3. Detection model
  let score: ModelScore | null = null;
  if (model.status === "ok") {
    score = model.output.score;
    checks.push({ name: model.name, status: "ok", message: "Detection model analysed the image." });
    evidence.push({
      id: "model",
      source: "Detection model",
      direction: score.ai >= 0.5 ? "ai" : "human",
      strength: Math.abs(score.ai - 0.5) >= 0.35 ? "strong" : Math.abs(score.ai - 0.5) >= 0.2 ? "moderate" : "weak",
      title: `${score.provider}: ${pct(score.ai)} AI likelihood`,
      detail: `${score.provider} estimates a ${pct(score.ai)} chance this image was generated by AI, from the pixels alone.`,
    });
    caveats.push(IMAGE_CAVEATS.model);
    if (!decided()) {
      if (score.ai >= THRESHOLDS.image.ai) {
        decide("likely_ai", "model", "Likely AI-generated", `${score.provider} estimates a ${pct(score.ai)} chance this image is AI-generated. No Content Credentials or metadata confirm it either way. This is an estimate, not proof.`);
      } else if (score.ai <= THRESHOLDS.image.notAi) {
        decide("likely_not_ai", "model", "No sign of AI generation", `${score.provider} estimates only a ${pct(score.ai)} chance this image is AI-generated. That is not proof it is authentic: skilled edits and new AI tools can evade detection.`);
      } else {
        out.basis = "model";
        out.headline = "Inconclusive";
        out.summary = `${score.provider} estimates a ${pct(score.ai)} chance this image is AI-generated, which is too uncertain for a conclusion, and no Content Credentials or AI metadata were found.`;
      }
    } else {
      const agrees = (score.ai >= 0.5) === ["ai_generated", "ai_edited", "likely_ai"].includes(out.verdict);
      if (!agrees && out.verdict !== "tampered") {
        evidence.push({ id: "conflict", source: "PanPen", direction: "neutral", strength: "info", title: "The model and the provenance disagree", detail: "PanPen's result follows the image's declared provenance, which is more reliable than a pixel-based estimate. Edited or re-saved images often confuse detection models." });
      }
    }
  } else {
    checks.push({ name: model.name, status: model.status, message: model.message });
  }
  checks.push({ name: "Invisible watermarks (e.g. SynthID)", status: "skipped", message: "Not checkable by PanPen. Use the provider's own detector where one exists." });

  if (out.basis === "none") {
    out.headline = "Inconclusive";
    out.summary =
      model.status === "ok"
        ? out.summary
        : "PanPen found no Content Credentials and no AI-related metadata, and no detection model result is available. That is common for images shared on social media and is not evidence the image is human-made.";
    if (meta.camera) out.summary += " The camera details in the file are consistent with a photo, but they can be copied or faked.";
  }

  caveats.push(IMAGE_CAVEATS.missing, IMAGE_CAVEATS.metadata, IMAGE_CAVEATS.watermark, IMAGE_CAVEATS.general);

  const metadata: [string, string][] = [];
  if (file.width && file.height) metadata.push(["Dimensions", `${file.width} × ${file.height}`]);
  if (credentials) {
    if (credentials.signer) metadata.push(["Signed by", credentials.signer]);
    if (credentials.signedAt) metadata.push(["Signed at", credentials.signedAt]);
    if (credentials.generator) metadata.push(["Made with (claim generator)", credentials.generator]);
    if (credentials.sourceTypes.length) metadata.push(["Digital source type (C2PA)", labels(credentials.sourceTypes)]);
    if (credentials.actions.length) metadata.push(["Recorded actions", credentials.actions.join(", ")]);
  }
  metadata.push(...meta.rows);

  return { kind: "image", id, createdAt, ...out, score, file, credentials, metadata, evidence, checks, caveats };
}
