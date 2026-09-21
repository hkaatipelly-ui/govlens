/**
 * SQLite access layer (server-only).
 *
 * Uses Node's built-in `node:sqlite` (no native deps). The database file path
 * comes from DATABASE_PATH with a safe default inside the project — never
 * exposed to client code.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export function resolveDatabasePath(): string {
  return (
    process.env.DATABASE_PATH ??
    join(process.cwd(), ".govlens-data", "govlens.db")
  );
}

type Statement = {
  run(...params: unknown[]): void;
  all(...params: unknown[]): Record<string, unknown>[];
  get(...params: unknown[]): Record<string, unknown> | undefined;
};

export type Database = {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
};

let singleton: Database | null = null;

export function getDatabase(): Database {
  if (singleton) return singleton;
  const { DatabaseSync } = require("node:sqlite") as {
    DatabaseSync: new (path: string) => Database;
  };
  const file = resolveDatabasePath();
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  singleton = new DatabaseSync(file);
  return singleton;
}

/** Test helper: independent DB handle (never touches the singleton). */
export function openTestDatabase(): Database {
  const { DatabaseSync } = require("node:sqlite") as {
    DatabaseSync: new (path: string) => Database;
  };
  return new DatabaseSync(":memory:");
}

export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
