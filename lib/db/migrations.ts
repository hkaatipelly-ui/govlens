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
  // Analysis-foundation tables (additive; existing data untouched).
  db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_documents (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      case_id TEXT,
      source_type TEXT NOT NULL,
      file_name TEXT,
      page_count INTEGER NOT NULL DEFAULT 1,
      language TEXT NOT NULL DEFAULT 'en',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_pages (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      document_id TEXT NOT NULL REFERENCES analysis_documents(id),
      page_number INTEGER NOT NULL,
      text TEXT NOT NULL,
      ocr_status TEXT NOT NULL DEFAULT 'unknown'
    );

    CREATE TABLE IF NOT EXISTS document_entities (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      document_id TEXT NOT NULL REFERENCES analysis_documents(id),
      entity_type TEXT NOT NULL,
      canonical_value TEXT NOT NULL,
      original_value TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      text_span TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5
    );

    CREATE TABLE IF NOT EXISTS document_claims (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      document_id TEXT NOT NULL REFERENCES analysis_documents(id),
      claim_text TEXT NOT NULL,
      source_page INTEGER NOT NULL,
      source_text TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      materiality TEXT NOT NULL DEFAULT 'medium',
      verification_status TEXT NOT NULL DEFAULT 'extracted'
    );

    CREATE TABLE IF NOT EXISTS document_evidence (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      document_id TEXT NOT NULL REFERENCES analysis_documents(id),
      source_type TEXT NOT NULL,
      source_name TEXT NOT NULL,
      page INTEGER,
      text TEXT NOT NULL,
      url TEXT,
      retrieved_at TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'extracted'
    );

    CREATE INDEX IF NOT EXISTS idx_adoc_owner ON analysis_documents(owner_id);
    CREATE INDEX IF NOT EXISTS idx_adoc_session ON analysis_documents(session_id);
    CREATE INDEX IF NOT EXISTS idx_adoc_case ON analysis_documents(case_id);
    CREATE INDEX IF NOT EXISTS idx_dpages_doc ON document_pages(document_id);
    CREATE INDEX IF NOT EXISTS idx_dent_doc ON document_entities(document_id);
    CREATE INDEX IF NOT EXISTS idx_dent_owner ON document_entities(owner_id);
    CREATE INDEX IF NOT EXISTS idx_dent_type ON document_entities(entity_type);
    CREATE INDEX IF NOT EXISTS idx_dclaim_doc ON document_claims(document_id);
    CREATE INDEX IF NOT EXISTS idx_dclaim_owner ON document_claims(owner_id);
    CREATE INDEX IF NOT EXISTS idx_dev_doc ON document_evidence(document_id);
    CREATE INDEX IF NOT EXISTS idx_dev_owner ON document_evidence(owner_id);
  `);
  // Deep-analysis tables (additive).
  db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_questions (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      parent_question_id TEXT,
      dimension TEXT NOT NULL,
      question TEXT NOT NULL,
      target_claim_id TEXT,
      importance TEXT NOT NULL DEFAULT 'relevant',
      question_status TEXT NOT NULL DEFAULT 'unanswered',
      answer TEXT NOT NULL DEFAULT '',
      confidence REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS analysis_answers (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      answer TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5
    );

    CREATE TABLE IF NOT EXISTS timelines (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      date TEXT NOT NULL,
      event TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'document',
      page INTEGER NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      flag TEXT NOT NULL DEFAULT 'none'
    );

    CREATE TABLE IF NOT EXISTS contradictions (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      category TEXT NOT NULL,
      claim_a TEXT NOT NULL,
      claim_b TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'relevant',
      explanation TEXT NOT NULL,
      verification_required TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS analysis_reports (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      executive_summary TEXT NOT NULL DEFAULT '',
      missing_information_json TEXT NOT NULL DEFAULT '[]',
      verification_requirements_json TEXT NOT NULL DEFAULT '[]',
      unresolved_questions_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analysis_findings (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      report_id TEXT NOT NULL REFERENCES analysis_reports(id),
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      materiality TEXT NOT NULL DEFAULT 'relevant',
      confidence REAL NOT NULL DEFAULT 0.5
    );

    CREATE INDEX IF NOT EXISTS idx_aq_doc ON analysis_questions(document_id);
    CREATE INDEX IF NOT EXISTS idx_aq_owner ON analysis_questions(owner_id);
    CREATE INDEX IF NOT EXISTS idx_tl_doc ON timelines(document_id);
    CREATE INDEX IF NOT EXISTS idx_cx_doc ON contradictions(document_id);
    CREATE INDEX IF NOT EXISTS idx_cx_owner ON contradictions(owner_id);
    CREATE INDEX IF NOT EXISTS idx_ar_session ON analysis_reports(session_id);
    CREATE INDEX IF NOT EXISTS idx_af_report ON analysis_findings(report_id);
  `);
  // Scheme-analysis tables (additive).
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheme_reports (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      scheme_name TEXT,
      issuing_authority TEXT,
      objective TEXT NOT NULL DEFAULT '',
      deadline TEXT,
      benefit TEXT NOT NULL DEFAULT '',
      amount TEXT,
      application_method TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS eligibility_requirements (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      report_id TEXT NOT NULL REFERENCES scheme_reports(id),
      requirement TEXT NOT NULL,
      extracted_rule TEXT NOT NULL DEFAULT '',
      user_evidence TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'UNKNOWN',
      missing_evidence TEXT NOT NULL DEFAULT '',
      explanation TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS scheme_documents (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      report_id TEXT NOT NULL REFERENCES scheme_reports(id),
      document_name TEXT NOT NULL,
      why_required TEXT NOT NULL DEFAULT '',
      issuer TEXT NOT NULL DEFAULT '',
      acceptable_evidence TEXT NOT NULL DEFAULT '',
      validity_recency TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT 'unknown',
      source TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_sr_session ON scheme_reports(session_id);
    CREATE INDEX IF NOT EXISTS idx_sr_owner ON scheme_reports(owner_id);
    CREATE INDEX IF NOT EXISTS idx_er_report ON eligibility_requirements(report_id);
    CREATE INDEX IF NOT EXISTS idx_sd_report ON scheme_documents(report_id);
  `);
  // Verification-engine tables (additive).
  db.exec(`
    CREATE TABLE IF NOT EXISTS verification_sources (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      adapter_id TEXT NOT NULL,
      authority TEXT NOT NULL,
      source_url TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS verification_results (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      claim_id TEXT NOT NULL DEFAULT '',
      source_id TEXT NOT NULL,
      field TEXT NOT NULL,
      document_value TEXT NOT NULL,
      external_value TEXT NOT NULL DEFAULT '',
      comparison TEXT NOT NULL DEFAULT 'not_compared',
      status TEXT NOT NULL,
      explanation TEXT NOT NULL,
      retrieved_at TEXT NOT NULL,
      source_url TEXT,
      source_type TEXT NOT NULL DEFAULT 'user_provided',
      evidence_id TEXT NOT NULL DEFAULT '',
      human_review_required INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_vs_owner ON verification_sources(owner_id);
    CREATE INDEX IF NOT EXISTS idx_vr_doc ON verification_results(document_id);
    CREATE INDEX IF NOT EXISTS idx_vr_owner ON verification_results(owner_id);
    CREATE INDEX IF NOT EXISTS idx_vr_claim ON verification_results(claim_id);
    CREATE INDEX IF NOT EXISTS idx_vr_status ON verification_results(status);
  `);
  // Additive columns for newer features (idempotent).
  for (const ddl of [
    `ALTER TABLE sessions ADD COLUMN verification_json TEXT`,
    `ALTER TABLE sessions ADD COLUMN explanation_json TEXT`,
    `ALTER TABLE sessions ADD COLUMN file_name TEXT`,
    `ALTER TABLE sessions ADD COLUMN file_type TEXT`,
    `ALTER TABLE sessions ADD COLUMN owner_id TEXT`,
    `ALTER TABLE documents ADD COLUMN owner_id TEXT`,
    `ALTER TABLE document_extractions ADD COLUMN owner_id TEXT`,
    `ALTER TABLE conversation_messages ADD COLUMN owner_id TEXT`,
    `ALTER TABLE cases ADD COLUMN verification_json TEXT`,
    `ALTER TABLE cases ADD COLUMN explanation_json TEXT`,
    `ALTER TABLE cases ADD COLUMN qa_json TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE cases ADD COLUMN file_name TEXT`,
    `ALTER TABLE cases ADD COLUMN file_type TEXT`,
    `ALTER TABLE cases ADD COLUMN owner_id TEXT`,
    `ALTER TABLE checklist_items ADD COLUMN owner_id TEXT`,
  ]) {
    try {
      db.exec(ddl);
    } catch {
      /* column already exists */
    }
  }
  // Ownership backfill for pre-fix records (idempotent): attribute to the
  // clearly-named prototype owner instead of deleting working data.
  // NOTE: cases table may predate the canonical schema on very old DBs; the
  // legacy reset above handles that before these columns are referenced.
  for (const table of [
    "sessions",
    "documents",
    "document_extractions",
    "conversation_messages",
    "cases",
    "checklist_items",
  ]) {
    try {
      db.exec(`UPDATE ${table} SET owner_id = 'prototype-admin' WHERE owner_id IS NULL`);
    } catch {
      /* table/column absent */
    }
  }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_cases_owner ON cases(owner_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_owner ON sessions(owner_id)`);
  } catch {
    /* indexes exist */
  }
}
