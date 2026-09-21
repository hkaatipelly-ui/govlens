/**
 * Schema migrations (server-only). Idempotent: safe to run on every boot.
 */
import type { Database } from "./database";

export const SCHEMA_VERSION = 1;

export function migrate(db: Database): void {
  // One-time upgrade: prototype DBs created before the canonical schema have a
  // legacy `cases` table without session_id. Reset it (local demo data only).
  try {
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='cases'`).get();
    if (tables) {
      const cols = db.prepare(`PRAGMA table_info(cases)`).all();
      const hasSession = cols.some((c) => String(c.name) === "session_id");
      if (!hasSession) db.exec(`DROP TABLE IF EXISTS cases;`);
    }
  } catch {
    /* fresh database — nothing to upgrade */
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      document_text TEXT NOT NULL,
      ocr_json TEXT,
      extraction_json TEXT,
      source_ids_json TEXT NOT NULL DEFAULT '[]',
      language TEXT NOT NULL DEFAULT 'en',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      raw_text TEXT NOT NULL,
      cleaned_text TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      confidence REAL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_extractions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      extraction_json TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      grounded INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS government_sources (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      department TEXT NOT NULL,
      state TEXT NOT NULL,
      document_type TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      source_url TEXT NOT NULL,
      published_date TEXT NOT NULL,
      effective_date TEXT NOT NULL,
      last_verified TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES government_sources(id),
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      keywords_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      title TEXT NOT NULL,
      document_type TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      summary TEXT NOT NULL,
      deadline TEXT,
      amount TEXT,
      reference_number TEXT,
      required_documents_json TEXT NOT NULL DEFAULT '[]',
      required_actions_json TEXT NOT NULL DEFAULT '[]',
      warning_signals_json TEXT NOT NULL DEFAULT '[]',
      source_ids_json TEXT NOT NULL DEFAULT '[]',
      original_text TEXT NOT NULL,
      evidence_json TEXT NOT NULL DEFAULT '[]',
      checklist_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS case_sources (
      case_id TEXT NOT NULL REFERENCES cases(id),
      source_id TEXT NOT NULL REFERENCES government_sources(id),
      PRIMARY KEY (case_id, source_id)
    );

    CREATE TABLE IF NOT EXISTS checklist_items (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id),
      label TEXT NOT NULL,
      detail TEXT,
      source_id TEXT,
      done INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_documents_session ON documents(session_id);
    CREATE INDEX IF NOT EXISTS idx_extractions_session ON document_extractions(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON conversation_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_document ON knowledge_chunks(document_id);
    CREATE INDEX IF NOT EXISTS idx_cases_session ON cases(session_id);
    CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
    CREATE INDEX IF NOT EXISTS idx_checklist_case ON checklist_items(case_id);
  `);
  // Additive columns for newer features (idempotent).
  for (const ddl of [
    `ALTER TABLE sessions ADD COLUMN verification_json TEXT`,
    `ALTER TABLE sessions ADD COLUMN explanation_json TEXT`,
    `ALTER TABLE sessions ADD COLUMN file_name TEXT`,
    `ALTER TABLE sessions ADD COLUMN file_type TEXT`,
    `ALTER TABLE cases ADD COLUMN verification_json TEXT`,
    `ALTER TABLE cases ADD COLUMN explanation_json TEXT`,
    `ALTER TABLE cases ADD COLUMN qa_json TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE cases ADD COLUMN file_name TEXT`,
    `ALTER TABLE cases ADD COLUMN file_type TEXT`,
  ]) {
    try {
      db.exec(ddl);
    } catch {
      /* column already exists */
    }
  }
}
