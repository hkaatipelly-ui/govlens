/**
 * Owner-scoped persistence for the analysis foundation (server-only).
 * Every read/write takes ownerId — never trust client-supplied identity.
 */
import type { Database } from "../db/database";
import { getDatabase, newId, type Database as Db } from "../db/database";
import { migrate } from "../db/migrations";
import type { NormalizedDocument } from "../documents/normalized";
import type { Claim, Entity, Evidence } from "./schemas";

export interface FoundationBundle {
  documentId: string;
  classification: string;
  entities: number;
  claims: number;
  evidence: number;
}

export class AnalysisStore {
  constructor(private readonly db: Db = getDatabase()) {
    migrate(this.db);
  }

  saveFoundation(
    doc: NormalizedDocument,
    classification: string,
    entities: Entity[],
    claims: Claim[],
    evidence: Evidence[]
  ): FoundationBundle {
    const ownerId = doc.ownerId;
    this.db
      .prepare(
        `INSERT OR REPLACE INTO analysis_documents
         (id, owner_id, session_id, case_id, source_type, file_name, page_count, language, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        doc.documentId,
        ownerId,
        doc.sessionId,
        doc.caseId,
        doc.sourceType,
        doc.fileName,
        doc.pageCount,
        doc.language,
        doc.createdAt
      );
    const pageStmt = this.db.prepare(
      `INSERT INTO document_pages (id, owner_id, document_id, page_number, text, ocr_status)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    this.db.prepare(`DELETE FROM document_pages WHERE document_id = ? AND owner_id = ?`).run(doc.documentId, ownerId);
    for (const p of doc.pages) {
      pageStmt.run(newId(), ownerId, doc.documentId, p.pageNumber, p.text, p.ocrStatus);
    }
    const entStmt = this.db.prepare(
      `INSERT INTO document_entities (id, owner_id, document_id, entity_type, canonical_value, original_value, page_number, text_span, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    this.db.prepare(`DELETE FROM document_entities WHERE document_id = ? AND owner_id = ?`).run(doc.documentId, ownerId);
    for (const e of entities) {
      entStmt.run(newId(), ownerId, doc.documentId, e.entityType, e.canonicalValue, e.originalValue, e.pageNumber, e.textSpan, e.confidence);
    }
    const claimStmt = this.db.prepare(
      `INSERT INTO document_claims (id, owner_id, document_id, claim_text, source_page, source_text, confidence, materiality, verification_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    this.db.prepare(`DELETE FROM document_claims WHERE document_id = ? AND owner_id = ?`).run(doc.documentId, ownerId);
    for (const c of claims) {
      claimStmt.run(newId(), ownerId, doc.documentId, c.claimText, c.sourcePage, c.sourceText, c.confidence, c.materiality, c.verificationStatus);
    }
    const evStmt = this.db.prepare(
      `INSERT INTO document_evidence (id, owner_id, document_id, source_type, source_name, page, text, url, retrieved_at, verification_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    this.db.prepare(`DELETE FROM document_evidence WHERE document_id = ? AND owner_id = ?`).run(doc.documentId, ownerId);
    for (const e of evidence) {
      evStmt.run(newId(), ownerId, doc.documentId, e.sourceType, e.sourceName, e.page, e.text, e.url, e.retrievedAt, e.verificationStatus);
    }
    return {
      documentId: doc.documentId,
      classification,
      entities: entities.length,
      claims: claims.length,
      evidence: evidence.length,
    };
  }

  /** Owner-scoped counts for a session's document (route-level checks first). */
  countsForSession(sessionId: string, ownerId: string): Record<string, number> {
    const count = (table: string, col: string, id: string) => {
      const row = this.db
        .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col} = ? AND owner_id = ?`)
        .get(id, ownerId) as { n: number } | undefined;
      return Number(row?.n ?? 0);
    };
    const docRow = this.db
      .prepare(`SELECT id FROM analysis_documents WHERE session_id = ? AND owner_id = ?`)
      .get(sessionId, ownerId) as { id: string } | undefined;
    if (!docRow) return { entities: 0, claims: 0, evidence: 0, pages: 0 };
    return {
      entities: count("document_entities", "document_id", docRow.id),
      claims: count("document_claims", "document_id", docRow.id),
      evidence: count("document_evidence", "document_id", docRow.id),
      pages: count("document_pages", "document_id", docRow.id),
    };
  }
}

let singleton: AnalysisStore | null = null;

export function getAnalysisStore(db?: Database): AnalysisStore {
  if (db) return new AnalysisStore(db);
  if (!singleton) singleton = new AnalysisStore();
  return singleton;
}
