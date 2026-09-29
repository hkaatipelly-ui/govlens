/** Owner-scoped verification persistence (server-only). */
import type { Database } from "../db/database";
import { getDatabase, newId, type Database as Db } from "../db/database";
import { migrate } from "../db/migrations";
import type { VerificationResult } from "./external-schemas";

export class VerificationStore {
  constructor(private readonly db: Db = getDatabase()) {
    migrate(this.db);
  }

  saveSources(ownerId: string, adapters: Array<{ adapterId: string; authority: string; sourceUrl: string }>): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO verification_sources (id, owner_id, adapter_id, authority, source_url)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const a of adapters) {
      stmt.run(`${ownerId}:${a.adapterId}`, ownerId, a.adapterId, a.authority, a.sourceUrl);
    }
  }

  saveResults(ownerId: string, documentId: string, results: VerificationResult[]): number {
    const stmt = this.db.prepare(
      `INSERT INTO verification_results (id, owner_id, document_id, claim_id, source_id, field, document_value, external_value, comparison, status, explanation, retrieved_at, source_url, source_type, evidence_id, human_review_required)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const r of results) {
      stmt.run(newId(), ownerId, documentId, r.claimId, r.sourceId, r.field, r.documentValue, r.externalValue, r.comparison, r.status, r.explanation, r.retrievedAt, r.sourceUrl, r.sourceType, r.evidenceId, r.humanReviewRequired ? 1 : 0);
    }
    return results.length;
  }

  resultsForDocument(documentId: string, ownerId: string): VerificationResult[] {
    return (
      this.db
        .prepare(`SELECT * FROM verification_results WHERE document_id = ? AND owner_id = ? ORDER BY retrieved_at ASC`)
        .all(documentId, ownerId) as Record<string, unknown>[]
    ).map((row) => ({
      resultId: String(row.id),
      claimId: String(row.claim_id ?? ""),
      sourceId: String(row.source_id),
      field: String(row.field),
      documentValue: String(row.document_value ?? ""),
      externalValue: String(row.external_value ?? ""),
      comparison: (row.comparison ?? "not_compared") as VerificationResult["comparison"],
      status: String(row.status) as VerificationResult["status"],
      explanation: String(row.explanation ?? ""),
      retrievedAt: String(row.retrieved_at ?? ""),
      sourceUrl: row.source_url ? String(row.source_url) : null,
      sourceType: (row.source_type ?? "user_provided") as VerificationResult["sourceType"],
      evidenceId: String(row.evidence_id ?? ""),
      humanReviewRequired: Number(row.human_review_required ?? 0) === 1,
    }));
  }

}

let singleton: VerificationStore | null = null;

export function getVerificationStore(db?: Database): VerificationStore {
  if (db) return new VerificationStore(db);
  if (!singleton) singleton = new VerificationStore();
  return singleton;
}
