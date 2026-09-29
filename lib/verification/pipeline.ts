/**
 * Verification pipeline orchestration (server-only):
 * DOCUMENT → extract claims (existing) → identify verifiable claims →
 * route to adapters → build lookup requests → (user supplies official values)
 * → normalize → compare → report. Gemma analyzes; sources + system decide.
 */
import type { Claim } from "../analysis/schemas";
import { adaptersFor, registerAdapter, getAdapter } from "./adapters";
import { registerBuiltInAdapters } from "./authorities";
import type { LookupRequest, UserEvidence, VerificationResult } from "./external-schemas";
import type { NormalizedExternalRecord } from "./adapters";

let registered = false;

export function ensureAdapters(): void {
  if (registered) return;
  // Avoid double-registration across hot reloads.
  if (!getAdapter("tg-land-bhubharati")) registerBuiltInAdapters();
  void registerAdapter;
  registered = true;
}

const VERIFIABLE_HINTS: RegExp[] = [
  /survey|khata|patta|extent|acre|gunta|holder|mutation/i,
  /regist|deed|consideration|stamp duty|sub-registrar/i,
  /\bcnr\b|case no|filing number|fir|crime no|petitioner|respondent|court/i,
  /eligib|scheme|beneficiar|income|age \d|residence/i,
  /application (number|no)|reference (number|no)|acknowledgement/i,
  /Rs\.?\s?[\d,]+|fee|amount/i,
  /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/,
];

/** Claims worth verifying: material/high claims matching authority patterns. */
export function identifyVerifiableClaims(claims: Claim[]): Claim[] {
  return claims.filter(
    (c) =>
      (c.materiality === "high" || c.materiality === "medium") &&
      VERIFIABLE_HINTS.some((re) => re.test(c.claimText))
  );
}

export interface ClaimRoute {
  claimId: string;
  adapterIds: string[];
  lookups: LookupRequest[];
}

/** Route each verifiable claim to capable adapters with lookup requests. */
export function routeClaims(documentId: string, claims: Claim[]): ClaimRoute[] {
  ensureAdapters();
  return identifyVerifiableClaims(claims).map((claim) => {
    const adapters = adaptersFor(claim);
    return {
      claimId: claim.claimId,
      adapterIds: adapters.map((a) => a.adapterId),
      lookups: adapters
        .map((a) => {
          try {
            return a.buildLookupRequest(claim, documentId);
          } catch {
            return null;
          }
        })
        .filter((l): l is LookupRequest => l !== null),
    };
  });
}

/**
 * Normalize user-supplied official values and compare against the claim.
 * Trust boundary: output separates DOCUMENT CLAIM / EXTERNAL RECORD /
 * COMPARISON — never a legal conclusion.
 */
export function verifyWithUserEvidence(
  claim: Claim,
  input: UserEvidence,
  ids: { evidenceId: string }
): VerificationResult[] {
  ensureAdapters();
  const adapter = getAdapter(input.adapterId);
  const now = new Date().toISOString();
  if (!adapter) {
    return [
      {
        resultId: `${input.adapterId}-${Date.now()}-unknown`,
        claimId: input.claimId || claim.claimId,
        sourceId: input.adapterId,
        field: "adapter",
        documentValue: claim.claimText.slice(0, 500),
        externalValue: "",
        comparison: "not_compared",
        status: "CHECK_NOT_AVAILABLE",
        explanation: "Unknown verification adapter; unable to verify. Further verification is required.",
        retrievedAt: now,
        sourceUrl: input.sourceUrl,
        sourceType: "user_provided",
        evidenceId: ids.evidenceId,
        humanReviewRequired: true,
      },
    ];
  }
  const record: NormalizedExternalRecord = {
    adapterId: adapter.adapterId,
    authority: adapter.authority,
    sourceUrl: input.sourceUrl,
    fields: input.fields,
    retrievedAt: now,
    origin: "user_provided",
  };
  const stamp = Date.now();
  return adapter.compare(claim, record, {
    resultId: `${adapter.adapterId}-${stamp}`,
    sourceId: adapter.adapterId,
    evidenceId: ids.evidenceId,
  });
}
