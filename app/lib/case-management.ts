import { randomUUID } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Case, CaseStatus } from "../types/case";

export interface CaseStore {
  create(input: Omit<Case, "id" | "createdAt" | "status"> & { status?: CaseStatus }): Case;
  list(): Case[];
  get(id: string): Case | null;
}

const DATA_DIR = process.env.GOVLENS_DATA_DIR ?? join(process.cwd(), ".govlens-data");
const DB_PATH = join(DATA_DIR, "govlens.db");
const FALLBACK_PATH = join(DATA_DIR, "cases.json");

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

type SqliteDb = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): void;
    all(...params: unknown[]): Record<string, unknown>[];
    get(...params: unknown[]): Record<string, unknown> | undefined;
  };
  close(): void;
};

/** SQLite-backed store using Node's built-in node:sqlite (no native deps). */
class SqliteCaseStore implements CaseStore {
  private db: SqliteDb;

  constructor() {
    ensureDir();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require("node:sqlite") as {
      DatabaseSync: new (path: string) => SqliteDb;
    };
    this.db = new DatabaseSync(DB_PATH);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cases (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL,
        language TEXT NOT NULL,
        document_text TEXT NOT NULL,
        ocr_confidence REAL,
        analysis TEXT NOT NULL,
        evidence TEXT NOT NULL,
        checklist TEXT NOT NULL,
        user_note TEXT
      );
    `);
  }

  create(input: Omit<Case, "id" | "createdAt" | "status"> & { status?: CaseStatus }): Case {
    const full: Case = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      status: input.status ?? "new",
      ...input,
    };
    this.db
      .prepare(
        `INSERT INTO cases (id, created_at, status, language, document_text, ocr_confidence, analysis, evidence, checklist, user_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        full.id,
        full.createdAt,
        full.status,
        full.language,
        full.documentText,
        full.ocrConfidence ?? null,
        JSON.stringify(full.analysis),
        JSON.stringify(full.evidence),
        JSON.stringify(full.checklist),
        full.userNote ?? null
      );
    return full;
  }

  list(): Case[] {
    const rows = this.db
      .prepare(`SELECT * FROM cases ORDER BY created_at DESC`)
      .all();
    return rows.map(rowToCase);
  }

  get(id: string): Case | null {
    const row = this.db.prepare(`SELECT * FROM cases WHERE id = ?`).get(id);
    return row ? rowToCase(row) : null;
  }
}

function rowToCase(row: Record<string, unknown>): Case {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    status: (row.status as CaseStatus) ?? "new",
    language: (row.language as "en" | "te") ?? "en",
    documentText: String(row.document_text ?? ""),
    ocrConfidence: typeof row.ocr_confidence === "number" ? row.ocr_confidence : undefined,
    analysis: JSON.parse(String(row.analysis)),
    evidence: JSON.parse(String(row.evidence)),
    checklist: JSON.parse(String(row.checklist)),
    userNote: row.user_note ? String(row.user_note) : undefined,
  };
}

/** JSON-file fallback (used if node:sqlite is unavailable). Same Case shape. */
class JsonFileCaseStore implements CaseStore {
  private readAll(): Case[] {
    ensureDir();
    if (!existsSync(FALLBACK_PATH)) return [];
    try {
      return JSON.parse(readFileSync(FALLBACK_PATH, "utf8")) as Case[];
    } catch {
      return [];
    }
  }

  private writeAll(cases: Case[]) {
    ensureDir();
    writeFileSync(FALLBACK_PATH, JSON.stringify(cases, null, 2));
  }

  create(input: Omit<Case, "id" | "createdAt" | "status"> & { status?: CaseStatus }): Case {
    const full: Case = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      status: input.status ?? "new",
      ...input,
    };
    const all = this.readAll();
    all.unshift(full);
    this.writeAll(all);
    return full;
  }

  list(): Case[] {
    return this.readAll().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  get(id: string): Case | null {
    return this.readAll().find((c) => c.id === id) ?? null;
  }
}

let singleton: CaseStore | null = null;

export function getCaseStore(): CaseStore {
  if (singleton) return singleton;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:sqlite");
    singleton = new SqliteCaseStore();
  } catch {
    singleton = new JsonFileCaseStore();
  }
  return singleton;
}

export function storageKind(): "sqlite" | "json-file" {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:sqlite");
    return "sqlite";
  } catch {
    return "json-file";
  }
}
