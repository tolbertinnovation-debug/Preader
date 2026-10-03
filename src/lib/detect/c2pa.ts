// Content Credentials (C2PA) verification using the official C2PA SDK.
// Remote manifests and OCSP lookups are disabled: PanPen only reads what is inside
// the uploaded file, so a crafted image can't make the server fetch arbitrary URLs.
import { C2PA_TRUST_ANCHORS } from "./trust-list";
import { SOURCE_TYPES, sourceTypeName } from "./image-meta";
import type { CredentialSummary } from "./types";

export type C2paOutcome =
  | { status: "none" }
  | { status: "remote"; url: string }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string }
  | {
      status: "found";
      summary: CredentialSummary;
      /** The claim signature itself verified (the manifest is genuine), even if the pixels changed later. */
      claimSigned: boolean;
      /** The image data no longer matches what was signed. */
      contentChanged: boolean;
      /** Source types declared by the active manifest's own actions. */
      activeSourceTypes: string[];
      /** Source types declared anywhere in the provenance chain, including ingredients. */
      historySourceTypes: string[];
      aiAgents: string[];
    };

type Action = { action?: string; digitalSourceType?: string; softwareAgent?: string | { name?: string } };
type ManifestLike = {
  claim_generator?: string;
  claim_generator_info?: { name?: string; version?: string }[];
  signature_info?: { issuer?: string; common_name?: string; time?: string };
  assertions?: { label: string; data?: { actions?: Action[] } }[];
  ingredients?: { active_manifest?: string }[];
};
type StoreLike = {
  active_manifest?: string;
  manifests?: Record<string, ManifestLike>;
  validation_state?: string;
  validation_results?: {
    activeManifest?: { success?: { code: string }[]; failure?: { code: string }[]; informational?: { code: string }[] };
    ingredientDeltas?: { validationDeltas?: { failure?: { code: string }[] } }[];
  };
  validation_status?: { code: string }[];
};

const CONTENT_HASH_FAILURES = new Set(["assertion.dataHash.mismatch", "assertion.bmffHash.mismatch", "assertion.boxesHash.mismatch", "assertion.collectionHash.mismatch"]);

const FAILURE_TEXT: Record<string, string> = {
  "assertion.dataHash.mismatch": "The image data changed after it was signed.",
  "assertion.bmffHash.mismatch": "The image data changed after it was signed.",
  "assertion.boxesHash.mismatch": "The image data changed after it was signed.",
  "claimSignature.mismatch": "The signature does not match the credentials (they were altered).",
  "claimSignature.missing": "The credentials are not signed.",
  "signingCredential.invalid": "The signing certificate is invalid.",
  "signingCredential.revoked": "The signing certificate has been revoked.",
  "signingCredential.expired": "The signing certificate had expired when it was used.",
  "assertion.hashedURI.mismatch": "Part of the credentials was altered after signing.",
  "assertion.missing": "Part of the credentials is missing.",
  "ingredient.manifest.missing": "An earlier step in the image's history is missing.",
};

let readerPromise: Promise<typeof import("@contentauth/c2pa-node")> | null = null;
function loadSdk() {
  // Loaded lazily so a missing native binary disables this check instead of crashing the route.
  readerPromise ??= import("@contentauth/c2pa-node");
  return readerPromise;
}

function trustAnchors(): string {
  return [process.env.C2PA_TRUST_ANCHORS || C2PA_TRUST_ANCHORS, process.env.C2PA_EXTRA_TRUST_ANCHORS ?? ""].join("\n");
}

function agentName(a: Action): string | null {
  const s = typeof a.softwareAgent === "string" ? a.softwareAgent : a.softwareAgent?.name;
  return s?.trim() || null;
}

function actionsOf(m: ManifestLike | undefined): Action[] {
  return (m?.assertions ?? []).filter((a) => a.label.startsWith("c2pa.actions")).flatMap((a) => a.data?.actions ?? []);
}

export async function readContentCredentials(buf: Buffer, mimeType: string): Promise<C2paOutcome> {
  let sdk: typeof import("@contentauth/c2pa-node");
  try {
    sdk = await loadSdk();
  } catch (err) {
    readerPromise = null;
    console.error("[preader] C2PA SDK unavailable", err);
    return { status: "unavailable", message: "The Content Credentials checker is not available on this server." };
  }

  let store: StoreLike;
  try {
    const context = new sdk.Context({
      trust: { trustAnchors: trustAnchors() },
      verify: { verifyTrust: true, verifyAfterReading: true, remoteManifestFetch: false, ocspFetch: false },
    });
    const reader = await sdk.Reader.fromAsset({ buffer: buf, mimeType }, context);
    if (!reader) return { status: "none" };
    store = reader.json() as unknown as StoreLike;
  } catch (err) {
    const msg = String(err);
    const remote = /RemoteManifestUrl\("([^"]+)"\)|remote manifests from url (\S+)/.exec(msg);
    if (remote) return { status: "remote", url: (remote[1] ?? remote[2])! };
    if (/JumbfNotFound|ManifestNotFound|UnsupportedType|PrereleaseError|NotFound/i.test(msg)) return { status: "none" };
    return { status: "error", message: "The Content Credentials in this file could not be read (they may be damaged)." };
  }

  const manifests = store.manifests ?? {};
  const active = store.active_manifest ? manifests[store.active_manifest] : undefined;
  if (!active) return { status: "none" };

  const vr = store.validation_results?.activeManifest;
  const notTrust = (c: string) => c !== "signingCredential.untrusted";
  const failures = (vr?.failure ?? []).map((f) => f.code).filter(notTrust);
  const historyFailures = (store.validation_results?.ingredientDeltas ?? [])
    .flatMap((d) => d.validationDeltas?.failure ?? [])
    .map((f) => f.code)
    .filter(notTrust);
  const codes = new Set([...(vr?.success ?? []), ...(vr?.informational ?? []), ...(vr?.failure ?? [])].map((c) => c.code));
  const stateRaw = (store.validation_state ?? "").toLowerCase();
  const state: CredentialSummary["state"] =
    stateRaw === "trusted" ? "trusted" : stateRaw === "valid" && failures.length === 0 && historyFailures.length === 0 ? "valid" : "invalid";

  const activeActions = actionsOf(active);
  const allActions = Object.values(manifests).flatMap(actionsOf);
  const known = (a: Action[]) => [...new Set(a.map((x) => x.digitalSourceType && sourceTypeName(x.digitalSourceType)).filter((n): n is string => !!n && n in SOURCE_TYPES))];
  const aiAgents = [
    ...new Set(
      allActions
        .filter((a) => a.digitalSourceType && SOURCE_TYPES[sourceTypeName(a.digitalSourceType)]?.group.startsWith("ai"))
        .map(agentName)
        .filter((n): n is string => !!n),
    ),
  ];

  const generator =
    active.claim_generator_info?.map((g) => [g.name, g.version].filter(Boolean).join(" ")).filter(Boolean).join(", ") || active.claim_generator || null;
  const signer = active.signature_info?.issuer || active.signature_info?.common_name || null;
  const contentChanged = failures.some((f) => CONTENT_HASH_FAILURES.has(f));
  const claimSigned =
    stateRaw === "trusted" ||
    stateRaw === "valid" ||
    (codes.has("claimSignature.validated") && !failures.some((f) => f.startsWith("claimSignature") || f.startsWith("signingCredential") || f === "assertion.hashedURI.mismatch"));

  const trustNote =
    state === "trusted"
      ? "Signed with a certificate on the official C2PA Trust List."
      : state === "valid"
        ? "The signature is valid and the file is unchanged since signing, but the signer's certificate isn't on the C2PA Trust List PanPen checks, so the signer's identity isn't independently confirmed."
        : "These credentials failed verification, so what they claim can't be relied on.";

  return {
    status: "found",
    summary: {
      state,
      signer,
      signedAt: active.signature_info?.time ?? null,
      generator,
      sourceTypes: known(allActions),
      actions: [...new Set(activeActions.map((a) => a.action?.replace(/^c2pa\./, "").replace(/_/g, " ") ?? "").filter(Boolean))],
      trustNote,
      failures: [
        ...new Set([
          ...failures.map((f) => FAILURE_TEXT[f] ?? f),
          ...historyFailures.map((f) => `Earlier step in the image's history: ${(FAILURE_TEXT[f] ?? f).replace(/^./, (c) => c.toLowerCase())}`),
          ...(state === "invalid" && failures.length === 0 && historyFailures.length === 0 ? ["The credentials failed verification."] : []),
        ]),
      ],
    },
    claimSigned,
    contentChanged,
    activeSourceTypes: known(activeActions),
    historySourceTypes: known(allActions),
    aiAgents,
  };
}
