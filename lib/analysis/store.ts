/**
 * Owner-scoped persistence for the analysis foundation (server-only).
 * Every read/write takes ownerId — never trust client-supplied identity.
 */
import type { Database } from "../db/database";
import { getDatabase, newId, nowIso, type Database as Db } from "../db/database";
import { migrate } from "../db/migrations";
import type { NormalizedDocument } from "../documents/normalized";
import type { Claim, Entity, Evidence } from "./schemas";
import type { AnalysisQuestion, Contradiction, DeepReport, TimelineEvent } from "./deep-schemas";
import type { Requirement, SchemeDocument, SchemeExtraction } from "./scheme-schemas";

export interface FoundationBundle {
  documentId: string;
  classification: string;
  entities: number;
  claims: number;
  evidence: number;
}

export interface DeepBundle {
  questions: number;
  timelineEvents: number;
  contradictions: number;
  findings: number;
}

export interface SchemeBundle {
  schemeName: string | null;
  requirements: number;
  satisfied: number;
  unknown: number;
  unsatisfied: number;
  missingDocuments: number;
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

  saveDeep(
    documentId: string,
    sessionId: string,
    ownerId: string,
    roots: AnalysisQuestion[],
    subquestions: AnalysisQuestion[],
    timeline: TimelineEvent[],
    contradictions: Contradiction[],
    report: DeepReport
  ): DeepBundle {
    const answerById = new Map(report.answers.map((a) => [a.questionId, a]));
    const qStmt = this.db.prepare(
      `INSERT INTO analysis_questions (id, owner_id, document_id, question_id, parent_question_id, dimension, question, target_claim_id, importance, question_status, answer, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    this.db.prepare(`DELETE FROM analysis_questions WHERE document_id = ? AND owner_id = ?`).run(documentId, ownerId);
    const aStmt = this.db.prepare(
      `INSERT INTO analysis_answers (id, owner_id, document_id, question_id, answer, confidence)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    this.db.prepare(`DELETE FROM analysis_answers WHERE document_id = ? AND owner_id = ?`).run(documentId, ownerId);
    let answered = 0;
    for (const q of [...roots, ...subquestions]) {
      const a = answerById.get(q.questionId);
      const status = a ? "answered" : q.questionStatus;
      if (a) answered += 1;
      qStmt.run(newId(), ownerId, documentId, q.questionId, q.parentQuestionId, q.dimension, q.question, q.targetClaimId, q.importance, status, a?.answer ?? "", a?.confidence ?? 0);
      if (a) aStmt.run(newId(), ownerId, documentId, q.questionId, a.answer, a.confidence);
    }
    const tStmt = this.db.prepare(
      `INSERT INTO timelines (id, owner_id, document_id, date, event, actor, source, page, confidence, flag)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    this.db.prepare(`DELETE FROM timelines WHERE document_id = ? AND owner_id = ?`).run(documentId, ownerId);
    for (const t of timeline) {
      tStmt.run(newId(), ownerId, documentId, t.date, t.event, t.actor, t.source, t.page, t.confidence, t.flag);
    }
    const cStmt = this.db.prepare(
      `INSERT INTO contradictions (id, owner_id, document_id, category, claim_a, claim_b, severity, explanation, verification_required)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    this.db.prepare(`DELETE FROM contradictions WHERE document_id = ? AND owner_id = ?`).run(documentId, ownerId);
    for (const c of contradictions) {
      cStmt.run(newId(), ownerId, documentId, c.category, c.claimA, c.claimB, c.severity, c.explanation, c.verificationRequired);
    }
    const reportId = newId();
    this.db
      .prepare(
        `INSERT INTO analysis_reports (id, owner_id, document_id, session_id, executive_summary, missing_information_json, verification_requirements_json, unresolved_questions_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(reportId, ownerId, documentId, sessionId, report.executiveSummary, JSON.stringify(report.missingInformation), JSON.stringify(report.verificationRequirements), JSON.stringify(report.unresolvedQuestions), nowIso());
    const fStmt = this.db.prepare(
      `INSERT INTO analysis_findings (id, owner_id, report_id, title, detail, materiality, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const f of report.findings) {
      fStmt.run(newId(), ownerId, reportId, f.title, f.detail, f.materiality, f.confidence);
    }
    return {
      questions: roots.length + subquestions.length,
      timelineEvents: timeline.length,
      contradictions: contradictions.length,
      findings: report.findings.length,
    };
  }

  saveScheme(
    documentId: string,
    sessionId: string,
    ownerId: string,
    scheme: SchemeExtraction,
    requirements: Requirement[],
    documents: SchemeDocument[]
  ): SchemeBundle {
    const reportId = newId();
    this.db
      .prepare(
        `INSERT INTO scheme_reports (id, owner_id, document_id, session_id, scheme_name, issuing_authority, objective, deadline, benefit, amount, application_method, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(reportId, ownerId, documentId, sessionId, scheme.schemeName, scheme.issuingAuthority, scheme.objective, scheme.deadline, scheme.benefit, scheme.amount, scheme.applicationMethod, nowIso());
    const rStmt = this.db.prepare(
      `INSERT INTO eligibility_requirements (id, owner_id, report_id, requirement, extracted_rule, user_evidence, status, missing_evidence, explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const r of requirements) {
      rStmt.run(newId(), ownerId, reportId, r.requirement, r.extractedRule, r.userEvidence, r.status, r.missingEvidence, r.explanation);
    }
    const dStmt = this.db.prepare(
      `INSERT INTO scheme_documents (id, owner_id, report_id, document_name, why_required, issuer, acceptable_evidence, validity_recency, state, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const d of documents) {
      dStmt.run(newId(), ownerId, reportId, d.documentName, d.whyRequired, d.issuer, d.acceptableEvidence, d.validityRecency, d.state, d.source);
    }
    const count = (s: string) => requirements.filter((r) => r.status === s).length;
    return {
      schemeName: scheme.schemeName,
      requirements: requirements.length,
      satisfied: count("SATISFIED"),
      unknown: count("UNKNOWN") + count("INSUFFICIENT_EVIDENCE"),
      unsatisfied: count("NOT_SATISFIED"),
      missingDocuments: documents.filter((d) => d.state === "missing" || d.state === "unknown").length,
    };
  }

  /** Owner-scoped full bundle read for report assembly. Returns null when not owned. */
  readBundle(documentId: string, ownerId: string): Record<string, unknown[]> | null {
    const doc = this.db
      .prepare(`SELECT * FROM analysis_documents WHERE id = ? AND owner_id = ?`)
      .get(documentId, ownerId) as Record<string, unknown> | undefined;
    if (!doc) return null;
    const q = (sql: string, ...params: unknown[]): Record<string, unknown>[] =>
      this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return {
      document: [doc],
      entities: q(`SELECT * FROM document_entities WHERE document_id = ? AND owner_id = ?`, documentId, ownerId),
      claims: q(`SELECT * FROM document_claims WHERE document_id = ? AND owner_id = ?`, documentId, ownerId),
      evidence: q(`SELECT * FROM document_evidence WHERE document_id = ? AND owner_id = ?`, documentId, ownerId),
      questions: q(`SELECT * FROM analysis_questions WHERE document_id = ? AND owner_id = ?`, documentId, ownerId),
      answers: q(`SELECT * FROM analysis_answers WHERE document_id = ? AND owner_id = ?`, documentId, ownerId),
      timeline: q(`SELECT * FROM timelines WHERE document_id = ? AND owner_id = ?`, documentId, ownerId),
      contradictions: q(`SELECT * FROM contradictions WHERE document_id = ? AND owner_id = ?`, documentId, ownerId),
      verification: q(`SELECT * FROM verification_results WHERE document_id = ? AND owner_id = ?`, documentId, ownerId),
      schemeReports: q(
        `SELECT sr.*, (SELECT json_group_array(json_object('requirement', requirement, 'status', status, 'explanation', explanation)) FROM eligibility_requirements WHERE report_id = sr.id AND owner_id = ?) AS reqs,
                (SELECT json_group_array(json_object('documentName', document_name, 'state', state, 'whyRequired', why_required)) FROM scheme_documents WHERE report_id = sr.id AND owner_id = ?) AS docs
         FROM scheme_reports sr WHERE document_id = ? AND owner_id = ?`, ownerId, ownerId, documentId, ownerId
      ),
      legalHeaders: q(`SELECT * FROM legal_headers WHERE document_id = ? AND owner_id = ?`, documentId, ownerId),
      parties: q(`SELECT * FROM parties WHERE document_id = ? AND owner_id = ?`, documentId, ownerId),
      provisions: q(`SELECT * FROM legal_provisions WHERE document_id = ? AND owner_id = ?`, documentId, ownerId),
      deepReports: q(`SELECT * FROM analysis_reports WHERE document_id = ? AND owner_id = ?`, documentId, ownerId),
    };
  }
}

let singleton: AnalysisStore | null = null;

export function getAnalysisStore(db?: Database): AnalysisStore {
  if (db) return new AnalysisStore(db);
  if (!singleton) singleton = new AnalysisStore();
  return singleton;
}
