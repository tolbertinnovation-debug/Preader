export type ModelSegmentOutput = {
  id: string;
  revised: string;
  changes: string;
  meaning_risk: "none" | "low" | "high";
  risk_note: string;
};

export type RewriteCall = {
  instructions: string;
  input: string;
  signal: AbortSignal;
  /** Stable, non-identifying hash of the user for OpenAI abuse monitoring. */
  safetyId: string;
};

export interface Provider {
  model: string;
  rewrite(call: RewriteCall): Promise<ModelSegmentOutput[]>;
  embed(texts: string[], signal: AbortSignal): Promise<number[][] | null>;
}

/** Thrown when the response was cut off; the caller can split the batch and retry. */
export class IncompleteError extends Error {}
