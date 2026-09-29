/** Owner-scoped legal-intelligence persistence (server-only). */
import type { Database } from "../db/database";
import { getDatabase, newId, nowIso, type Database as Db } from "../db/database";
import { migrate } from "../db/migrations";
import type { LegalHeader, Party, Provision, DocRelationship } from "./legal-schemas";

export interface LegalBundle {
  parties: number;
  provisions: number;
  relationships: number;
  matrixEntries: number;
}

export class LegalStore {
  constructor(private readonly db: Db = getDatabase()) {
    migrate(this.db);
  }

  saveLegal(
    documentId: string,
    ownerId: string,
    header: LegalHeader,
    parties: Party[],
    provisions: Provision[],
    relationships: DocRelationship[]
  ): LegalBundle {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO legal_headers (id, owner_id, document_id, court, jurisdiction, case_number, cnr, fir_number, police_station, filing_number, case_type, registration_year)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        `${documentId}-header`, ownerId, documentId, header.court, header.jurisdiction,
        header.caseNumber, header.cnr, header.firNumber, header.policeStation,
        header.filingNumber, header.caseType, header.registrationYear
      );
    const pStmt = this.db.prepare(
      `INSERT INTO parties (id, owner_id, document_id, name, role, role_evidence) VALUES (?, ?, ?, ?, ?, ?)`
    );
    this.db.prepare(`DELETE FROM parties WHERE document_id = ? AND owner_id = ?`).run(documentId, ownerId);
    for (const p of parties) {
      pStmt.run(newId(), ownerId, documentId, p.name, p.role, p.roleEvidence);
    }
    const vStmt = this.db.prepare(
      `INSERT INTO legal_provisions (id, owner_id, document_id, reference, kind, page_number) VALUES (?, ?, ?, ?, ?, ?)`
    );
    this.db.prepare(`DELETE FROM legal_provisions WHERE document_id = ? AND owner_id = ?`).run(documentId, ownerId);
    for (const v of provisions) {
      vStmt.run(newId(), ownerId, documentId, v.reference, v.kind, v.pageNumber);
    }
    const rStmt = this.db.prepare(
      `INSERT INTO doc_relationships (id, owner_id, from_document_id, to_reference, relation, evidence) VALUES (?, ?, ?, ?, ?, ?)`
    );
    this.db.prepare(`DELETE FROM doc_relationships WHERE from_document_id = ? AND owner_id = ?`).run(documentId, ownerId);
    for (const r of relationships) {
      rStmt.run(newId(), ownerId, r.fromDocumentId, r.toReference, r.relation, r.evidence);
    }
    return { parties: parties.length, provisions: provisions.length, relationships: relationships.length, matrixEntries: 0 };
  }

  /** Attach a document to the owner's session bundle (multi-doc case support). */
  attachToSessionBundle(sessionId: string, documentId: string, ownerId: string, title: string): string {
    let bundle = this.db
      .prepare(`SELECT id FROM case_bundles WHERE owner_id = ? AND id IN (SELECT bundle_id FROM case_bundle_items WHERE session_id = ?) LIMIT 1`)
      .get(ownerId, sessionId) as { id: string } | undefined;
    let bundleId = bundle?.id;
    if (!bundleId) {
      bundleId = newId();
      this.db
        .prepare(`INSERT INTO case_bundles (id, owner_id, title, created_at) VALUES (?, ?, ?, ?)`)
        .run(bundleId, ownerId, title.slice(0, 300), nowIso());
    }
    this.db
      .prepare(`INSERT OR IGNORE INTO case_bundle_items (bundle_id, document_id, session_id) VALUES (?, ?, ?)`)
      .run(bundleId, documentId, sessionId);
    return bundleId;
  }

  bundleDocuments(bundleId: string, ownerId: string): Array<{ documentId: string; sessionId: string }> {
    const bundle = this.db
      .prepare(`SELECT id FROM case_bundles WHERE id = ? AND owner_id = ?`)
      .get(bundleId, ownerId) as { id: string } | undefined;
    if (!bundle) return [];
    return this.db
      .prepare(`SELECT document_id AS documentId, session_id AS sessionId FROM case_bundle_items WHERE bundle_id = ?`)
      .all(bundleId) as Array<{ documentId: string; sessionId: string }>;
  }
}

let singleton: LegalStore | null = null;

export function getLegalStore(db?: Database): LegalStore {
  if (db) return new LegalStore(db);
  if (!singleton) singleton = new LegalStore();
  return singleton;
}
