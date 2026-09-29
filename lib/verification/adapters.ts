/**
 * VerificationSourceAdapter architecture + registry.
 *
 * No portal is hardcoded into the application core: each authority plugs in
 * through this interface. No adapter performs live external requests —
 * official portals here require CAPTCHA/auth or offer no machine API, so
 * adapters declare capabilities, build user-assisted lookup requests, and
 * compare user-supplied official values. Automated mode stays explicitly
 * unsupported until an official machine-readable API is confirmed.
 */
import type { Claim } from "../analysis/schemas";
import type { LookupRequest, VerificationResult } from "./external-schemas";

export interface NormalizedExternalRecord {
  adapterId: string;
  authority: string;
  sourceUrl: string | null;
  fields: Record<string, string>;
  retrievedAt: string;
  origin: "user_provided" | "knowledge_base";
}

export interface VerificationSourceAdapter {
  readonly adapterId: string;
  readonly authority: string;
  readonly sourceUrl: string;
  /** Can this adapter handle the claim at all? */
  canVerify(claim: Claim): boolean;
  /** Exact fields the user should look up + where. No automation. */
  buildLookupRequest(claim: Claim, documentId: string): LookupRequest | null;
  /** Compare normalized external values against the document claim. */
  compare(
    claim: Claim,
    record: NormalizedExternalRecord,
    ids: { resultId: string; sourceId: string; evidenceId: string }
  ): VerificationResult[];
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9./-]/g, "").replace(/^0+/, "");
}

function normNum(s: string): string | null {
  const m = s.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}

/** Shared field-level comparison with trust-boundary-safe statuses. */
export function compareField(
  field: string,
  documentValue: string,
  externalValue: string,
  ids: { resultId: string; sourceId: string; evidenceId: string; claimId: string },
  source: { sourceUrl: string | null; sourceType: VerificationResult["sourceType"] }
): VerificationResult {
  const now = new Date().toISOString();
  const base = {
    resultId: ids.resultId,
    claimId: ids.claimId,
    sourceId: ids.sourceId,
    field,
    documentValue: documentValue.slice(0, 500),
    externalValue: externalValue.slice(0, 500),
    retrievedAt: now,
    sourceUrl: source.sourceUrl,
    sourceType: source.sourceType,
    evidenceId: ids.evidenceId,
    humanReviewRequired: false,
  };
  if (!externalValue.trim()) {
    return {
      ...base,
      comparison: "missing",
      status: "UNABLE_TO_VERIFY",
      explanation: `No external value supplied for ${field}; unable to verify. Further verification is required.`,
      humanReviewRequired: true,
    };
  }
  if (norm(documentValue) === norm(externalValue)) {
    return {
      ...base,
      comparison: "equal",
      status: "MATCH",
      explanation: `${field} matches the external record.`,
    };
  }
  const dn = normNum(documentValue);
  const en = normNum(externalValue);
  if (dn != null && en != null) {
    const d = parseFloat(dn);
    const e = parseFloat(en);
    if (!Number.isNaN(d) && !Number.isNaN(e) && e !== 0 && Math.abs(d - e) / Math.abs(e) <= 0.05) {
      return {
        ...base,
        comparison: "close",
        status: "PARTIAL_MATCH",
        explanation: `${field} is close but not identical (document: ${documentValue}; external: ${externalValue}). Further verification is required.`,
        humanReviewRequired: true,
      };
    }
  }
  return {
    ...base,
    comparison: "different",
    status: "MISMATCH",
    explanation: `Potential record inconsistency detected: the uploaded document states ${documentValue} while the external record states ${externalValue} for ${field}. Further verification is required.`,
    humanReviewRequired: true,
  };
}

const registry = new Map<string, VerificationSourceAdapter>();

export function registerAdapter(adapter: VerificationSourceAdapter): void {
  registry.set(adapter.adapterId, adapter);
}

export function getAdapter(adapterId: string): VerificationSourceAdapter | undefined {
  return registry.get(adapterId);
}

export function listAdapters(): VerificationSourceAdapter[] {
  return [...registry.values()];
}

/** Route a claim to every adapter that declares capability. */
export function adaptersFor(claim: Claim): VerificationSourceAdapter[] {
  return listAdapters().filter((a) => {
    try {
      return a.canVerify(claim);
    } catch {
      return false;
    }
  });
}
