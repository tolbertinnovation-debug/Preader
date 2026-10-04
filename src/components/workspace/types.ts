import type { SegmentKind } from "@/lib/text/segment";
import type { Flag, RiskLevel } from "@/lib/text/verify";
import type { RewriteSummary, SegmentVoice, VoiceSummary } from "@/lib/ai/rewrite";
import type { ReadabilityStats } from "@/lib/text/readability";

export type Accepted = "revised" | "original" | "edited";

export type ClientSegment = {
  id: string;
  kind: SegmentKind;
  original: string;
  revised?: string;
  changes?: string;
  risk: RiskLevel;
  flags: Flag[];
  similarity: number | null;
  voice?: SegmentVoice;
  accepted: Accepted;
  edited?: string;
  pending: boolean;
  retrying?: boolean;
};

export type { RewriteSummary, ReadabilityStats, Flag, RiskLevel, SegmentVoice, VoiceSummary };

export function chosenText(s: ClientSegment): string {
  if (s.pending || s.revised === undefined) return s.original;
  if (s.accepted === "original") return s.original;
  if (s.accepted === "edited") return s.edited ?? s.revised;
  return s.revised;
}
