/** CaseService — canonical case persistence (server-only). */
import type { Database } from "../db/database";
import { getDatabase, newId, nowIso, type Database as Db } from "../db/database";
import { migrate } from "../db/migrations";
import type { DocumentExtraction } from "../extraction/schemas";
import type { Explanation, Verification } from "../verification/schemas";
import type { KnowledgeHit } from "../knowledge/KnowledgeEngine";
import type { ChecklistItem } from "../actions/ActionEngine";

export type CaseStatus = "open" | "needs_review" | "completed";

export interface CaseQA {
  q: string;
  a: string;
  grounded: boolean;
}

export interface Case {
  id: string;
  sessionId: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  title: string;
  documentType: string;
  language: string;
  summary: string;
  deadline: string | null;
  amount: string | null;
  referenceNumber: string | null;
  requiredDocuments: string[];
  requiredActions: string[];
  warningSignals: string[];
  sourceIds: string[];
  originalText: string;
  /** Rich display blobs (evidence passages + interactive checklist). */
  evidence: KnowledgeHit[];
  checklist: ChecklistItem[];
  verification: Verification | null;
  explanation: Explanation | null;
  qa: CaseQA[];
}

export interface CreateCaseInput {
  sessionId: string;
  title?: string;
  language?: string;
  originalText: string;
  extraction: DocumentExtraction;
  evidence: KnowledgeHit[];
  checklist: ChecklistItem[];
  verification?: Verification | null;
  explanation?: Explanation | null;
  qa?: CaseQA[];
}

function parseJson<T>(raw: unknown, fallback: T): T {
  try {
    if (raw == null) return fallback;
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

function rowToCase(row: Record<string, unknown>): Case {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    status: (row.status as CaseStatus) ?? "open",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    title: String(row.title),
    documentType: String(row.document_type),
    language: String(row.language ?? "en"),
    summary: String(row.summary),
    deadline: row.deadline ? String(row.deadline) : null,
    amount: row.amount ? String(row.amount) : null,
    referenceNumber: row.reference_number ? String(row.reference_number) : null,
    requiredDocuments: parseJson<string[]>(row.required_documents_json, []),
    requiredActions: parseJson<string[]>(row.required_actions_json, []),
    warningSignals: parseJson<string[]>(row.warning_signals_json, []),
    sourceIds: parseJson<string[]>(row.source_ids_json, []),
    originalText: String(row.original_text ?? ""),
    evidence: parseJson<KnowledgeHit[]>(row.evidence_json, []),
    checklist: parseJson<ChecklistItem[]>(row.checklist_json, []),
    verification: row.verification_json ? JSON.parse(String(row.verification_json)) : null,
    explanation: row.explanation_json ? JSON.parse(String(row.explanation_json)) : null,
    qa: parseJson<CaseQA[]>(row.qa_json, []),
  };
}

export class CaseService {
  constructor(private readonly db: Db = getDatabase()) {
    migrate(this.db);
  }

  create(input: CreateCaseInput): Case {
    const ex = input.extraction;
    const id = newId();
    const ts = nowIso();
    const title =
      input.title?.trim() ||
      ex.title ||
      `${ex.documentType}${ex.referenceNumber ? ` — ${ex.referenceNumber}` : ""}`;
    this.db
      .prepare(
        `INSERT INTO cases
         (id, session_id, status, created_at, updated_at, title, document_type, language,
          summary, deadline, amount, reference_number, required_documents_json,
          required_actions_json, warning_signals_json, source_ids_json,
          original_text, evidence_json, checklist_json,
          verification_json, explanation_json, qa_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.sessionId,
        "open",
        ts,
        ts,
        title,
        ex.documentType,
        input.language ?? ex.language ?? "en",
        ex.summary,
        ex.deadline,
        ex.amount,
        ex.referenceNumber,
        JSON.stringify(ex.requiredDocuments),
        JSON.stringify(ex.requiredActions),
        JSON.stringify(ex.warningSignals),
        JSON.stringify(ex.sourceIds),
        input.originalText,
        JSON.stringify(input.evidence),
        JSON.stringify(input.checklist),
        input.verification ? JSON.stringify(input.verification) : null,
        input.explanation ? JSON.stringify(input.explanation) : null,
        JSON.stringify(input.qa ?? [])
      );
    const link = this.db.prepare(
      `INSERT OR IGNORE INTO case_sources (case_id, source_id) VALUES (?, ?)`
    );
    for (const sid of ex.sourceIds) {
      try {
        link.run(id, sid);
      } catch {
        /* unknown source — recorded in source_ids_json, never fabricated */
      }
    }
    const itemStmt = this.db.prepare(
      `INSERT INTO checklist_items (id, case_id, label, detail, source_id, done) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const item of input.checklist) {
      itemStmt.run(newId(), id, item.label, item.detail ?? null, item.sourceId ?? null, item.done ? 1 : 0);
    }
    return this.get(id)!;
  }

  list(): Case[] {
    return this.db
      .prepare(`SELECT * FROM cases ORDER BY created_at DESC`)
      .all()
      .map(rowToCase);
  }

  get(id: string): Case | null {
    const row = this.db.prepare(`SELECT * FROM cases WHERE id = ?`).get(id);
    return row ? rowToCase(row) : null;
  }

  updateStatus(id: string, status: CaseStatus): Case | null {
    this.db
      .prepare(`UPDATE cases SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, nowIso(), id);
    return this.get(id);
  }
}

let singleton: CaseService | null = null;

export function getCaseService(db?: Database): CaseService {
  if (db) return new CaseService(db);
  if (!singleton) singleton = new CaseService();
  return singleton;
}
