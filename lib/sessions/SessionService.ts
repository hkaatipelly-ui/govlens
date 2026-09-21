/** SessionService — per-scan sessions isolate Q&A context (server-only). */
import type { Database } from "../db/database";
import { getDatabase, newId, nowIso, type Database as Db } from "../db/database";
import { migrate } from "../db/migrations";
import type { DocumentExtraction } from "../extraction/schemas";
import type { Explanation, Verification } from "../verification/schemas";

export interface Session {
  id: string;
  documentText: string;
  ocr: { rawText: string; cleanedText: string; language: string; confidence: number } | null;
  extraction: DocumentExtraction | null;
  verification: Verification | null;
  explanation: Explanation | null;
  sourceIds: string[];
  language: string;
  createdAt: string;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  grounded: boolean | null;
}

export class SessionService {
  constructor(private readonly db: Db = getDatabase()) {
    migrate(this.db);
  }

  create(input: { documentText: string; language: string; sessionId?: string }): Session {
    const id = input.sessionId ?? newId();
    const existing = this.get(id);
    if (existing && existing.documentText === input.documentText) return existing;
    this.db
      .prepare(
        `INSERT OR REPLACE INTO sessions (id, document_text, ocr_json, extraction_json, source_ids_json, language, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.documentText,
        existing?.ocr ? JSON.stringify(existing.ocr) : null,
        existing?.extraction ? JSON.stringify(existing.extraction) : null,
        JSON.stringify(existing?.sourceIds ?? []),
        input.language,
        existing?.createdAt ?? nowIso()
      );
    return this.get(id)!;
  }

  get(id: string): Session | null {
    const row = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id);
    if (!row) return null;
    return {
      id: String(row.id),
      documentText: String(row.document_text),
      ocr: row.ocr_json ? JSON.parse(String(row.ocr_json)) : null,
      extraction: row.extraction_json ? JSON.parse(String(row.extraction_json)) : null,
      verification: row.verification_json ? JSON.parse(String(row.verification_json)) : null,
      explanation: row.explanation_json ? JSON.parse(String(row.explanation_json)) : null,
      sourceIds: JSON.parse(String(row.source_ids_json ?? "[]")),
      language: String(row.language ?? "en"),
      createdAt: String(row.created_at),
    };
  }

  saveAnalysis(
    id: string,
    extraction: DocumentExtraction,
    sourceIds: string[],
    verification?: Verification | null,
    explanation?: Explanation | null
  ): void {
    this.db
      .prepare(
        `UPDATE sessions SET extraction_json = ?, source_ids_json = ?, verification_json = ?, explanation_json = ? WHERE id = ?`
      )
      .run(
        JSON.stringify(extraction),
        JSON.stringify(sourceIds),
        verification ? JSON.stringify(verification) : null,
        explanation ? JSON.stringify(explanation) : null,
        id
      );
    this.db
      .prepare(
        `INSERT INTO document_extractions (id, session_id, extraction_json, verified, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(newId(), id, JSON.stringify(extraction), extraction.sourceIds.length > 0 ? 1 : 0, nowIso());
  }

  saveDocument(
    sessionId: string,
    doc: { rawText: string; cleanedText: string; language: string; confidence: number }
  ): void {
    this.db
      .prepare(
        `INSERT INTO documents (id, session_id, raw_text, cleaned_text, language, confidence, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(newId(), sessionId, doc.rawText, doc.cleanedText, doc.language, doc.confidence, nowIso());
    this.db
      .prepare(`UPDATE sessions SET ocr_json = ? WHERE id = ?`)
      .run(JSON.stringify(doc), sessionId);
  }

  addMessage(sessionId: string, msg: ConversationMessage): void {
    this.db
      .prepare(
        `INSERT INTO conversation_messages (session_id, role, content, grounded, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        sessionId,
        msg.role,
        msg.content,
        msg.grounded == null ? null : msg.grounded ? 1 : 0,
        nowIso()
      );
  }

  history(sessionId: string): ConversationMessage[] {
    return this.db
      .prepare(`SELECT role, content, grounded FROM conversation_messages WHERE session_id = ? ORDER BY id ASC`)
      .all(sessionId)
      .map((r) => ({
        role: r.role as "user" | "assistant",
        content: String(r.content),
        grounded: r.grounded == null ? null : Number(r.grounded) === 1,
      }));
  }
}

let singleton: SessionService | null = null;

export function getSessionService(db?: Database): SessionService {
  if (db) return new SessionService(db);
  if (!singleton) singleton = new SessionService();
  return singleton;
}
