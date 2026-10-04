// Shared, client-safe types for the PanPen AI Content Detector.

/** Which way a piece of evidence points. "warning" is for integrity problems (tampering, hidden characters). */
export type EvidenceDirection = "ai" | "human" | "neutral" | "warning";
export type EvidenceStrength = "strong" | "moderate" | "weak" | "info";
export type EvidenceSource = "Content Credentials" | "Metadata" | "Detection model" | "Writing patterns" | "PanPen";

export type Evidence = {
  id: string;
  source: EvidenceSource;
  direction: EvidenceDirection;
  strength: EvidenceStrength;
  title: string;
  detail: string;
};

/** Status of each external or built-in check, so the user can see exactly what ran. */
export type CheckStatus = {
  name: string;
  status: "ok" | "not_configured" | "skipped" | "error" | "none_found";
  message: string;
};

/**
 * A score is only ever produced by a detection model. PanPen never derives a
 * percentage from metadata or writing patterns.
 */
export type ModelScore = {
  provider: string;
  /** Probability (0–1) that the content is AI-generated, as reported by the provider. */
  ai: number;
  /** Probability (0–1) of a human/AI mix, if the provider reports one. */
  mixed: number | null;
  /** Probability (0–1) that the content is human-made, if the provider reports one. */
  human: number | null;
  /** The provider's own confidence label, if any. */
  confidence: string | null;
};

export type TextVerdict = "likely_ai" | "mixed" | "likely_human" | "inconclusive";

export type ImageVerdict =
  | "ai_generated"
  | "ai_edited"
  | "likely_ai"
  | "camera_capture"
  | "likely_not_ai"
  | "tampered"
  | "inconclusive";

export type Verdict = TextVerdict | ImageVerdict;

export type HighlightKind = "model" | "phrase" | "artifact" | "hidden";

export type Highlight = {
  start: number;
  end: number;
  kind: HighlightKind;
  /** Provider probability for sentence highlights; null for pattern highlights. */
  ai: number | null;
  note: string;
};

export type TextResult = {
  kind: "text";
  id: string;
  createdAt: string;
  verdict: TextVerdict;
  headline: string;
  summary: string;
  score: ModelScore | null;
  words: number;
  text: string;
  highlights: Highlight[];
  evidence: Evidence[];
  checks: CheckStatus[];
  caveats: string[];
};

export type CredentialSummary = {
  state: "trusted" | "valid" | "invalid";
  signer: string | null;
  signedAt: string | null;
  generator: string | null;
  sourceTypes: string[];
  actions: string[];
  trustNote: string;
  failures: string[];
};

export type ImageResult = {
  kind: "image";
  id: string;
  createdAt: string;
  verdict: ImageVerdict;
  /** What the verdict rests on. */
  basis: "content_credentials" | "metadata" | "model" | "none";
  headline: string;
  summary: string;
  score: ModelScore | null;
  file: { name: string; type: string; bytes: number; sha256: string; width: number | null; height: number | null };
  credentials: CredentialSummary | null;
  metadata: [string, string][];
  evidence: Evidence[];
  checks: CheckStatus[];
  caveats: string[];
};

export type DetectResult = TextResult | ImageResult;

/** A result plus a server signature, so downloaded reports can't be forged through PanPen. */
export type Sealed<T extends DetectResult = DetectResult> = { result: T; seal: string };

export const VERDICT_LABEL: Record<Verdict, string> = {
  likely_ai: "Likely AI-generated",
  mixed: "Mixed: likely part AI",
  likely_human: "Likely human-written",
  inconclusive: "Inconclusive",
  ai_generated: "AI-generated",
  ai_edited: "Edited with AI",
  camera_capture: "Camera capture",
  likely_not_ai: "No sign of AI generation",
  tampered: "Credentials failed checks",
};

export const VERDICT_TONE: Record<Verdict, "ai" | "human" | "neutral" | "warning"> = {
  likely_ai: "ai",
  mixed: "ai",
  likely_human: "human",
  inconclusive: "neutral",
  ai_generated: "ai",
  ai_edited: "ai",
  camera_capture: "human",
  likely_not_ai: "human",
  tampered: "warning",
};

export const DETECT_LIMITS = {
  /** Below this, no model is asked and the result is always Inconclusive. */
  minWords: 100,
  /** Between minWords and this, stricter thresholds apply. */
  solidWords: 250,
  maxWords: 5000,
  maxChars: 40_000,
} as const;

/** Thresholds for turning a model probability into a verdict. Deliberately conservative. */
export const THRESHOLDS = {
  text: { ai: 0.85, aiShort: 0.95, human: 0.85, humanShort: 0.95, mixed: 0.6 },
  image: { ai: 0.85, notAi: 0.1 },
} as const;
