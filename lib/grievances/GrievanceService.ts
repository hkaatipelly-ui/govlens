import type { Database } from "../db/database";
import { getDatabase, newId, nowIso, type Database as Db } from "../db/database";
import { migrate } from "../db/migrations";
import { randomBytes } from "node:crypto";

export type GrievanceStatus =
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "NEEDS_INFORMATION"
  | "RESOLVED"
  | "CLOSED";

export interface GrievanceAttachment {
  filename: string;
  contentType: string;
  size: number;
  storagePath: string;
}

export interface Grievance {
  id: string;
  referenceNumber: string;
  ownerId: string;
  subject: string;
  description: string;
  category: string;
  location: string | null;
  status: GrievanceStatus;
  source: string;
  attachments: GrievanceAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface GrievanceQueueItem {
  id: string;
  referenceNumber: string;
  subject: string;
  category: string;
  location: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface StatusHistoryEntry {
  id: string;
  grievanceId: string;
  previousStatus: string | null;
  newStatus: string;
  publicMessage: string | null;
  internalNote?: string | null;
  actorId: string;
  actorRole: string;
  createdAt: string;
}

export interface CreateGrievanceInput {
  ownerId: string;
  subject: string;
  description: string;
  category: string;
  location?: string;
  attachments?: GrievanceAttachment[];
  source?: string;
  idempotencyKey?: string;
  actorRole?: string;
}

export const ALLOWED_TRANSITIONS: Record<GrievanceStatus, GrievanceStatus[]> = {
  SUBMITTED: ["UNDER_REVIEW", "CLOSED"],
  UNDER_REVIEW: ["NEEDS_INFORMATION", "RESOLVED", "CLOSED"],
  NEEDS_INFORMATION: ["UNDER_REVIEW", "CLOSED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
};

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function cryptoRef(): string {
  let out = "";
  const buf = randomBytes(8);
  for (let i = 0; i < 8; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  return `GL-${out.slice(0, 4)}-${out.slice(4)}`;
}

function parseAttachment(raw: unknown): GrievanceAttachment[] {
  try {
    const arr = JSON.parse(String(raw ?? "[]"));
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => x && typeof x === "object") as GrievanceAttachment[];
  } catch {
    return [];
  }
}

function rowToGrievance(row: Record<string, unknown>): Grievance {
  return {
    id: String(row.id),
    referenceNumber: String(row.reference_number),
    ownerId: String(row.owner_id),
    subject: String(row.subject),
    description: String(row.description),
    category: String(row.category),
    location: row.location ? String(row.location) : null,
    status: (row.status as GrievanceStatus) ?? "SUBMITTED",
    source: String(row.source ?? "public-service"),
    attachments: parseAttachment(row.attachments_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToHistory(row: Record<string, unknown>, includeInternal: boolean): StatusHistoryEntry {
  return {
    id: String(row.id),
    grievanceId: String(row.grievance_id),
    previousStatus: row.previous_status ? String(row.previous_status) : null,
    newStatus: String(row.new_status),
    publicMessage: row.public_message ? String(row.public_message) : null,
    internalNote: includeInternal ? (row.internal_note ? String(row.internal_note) : null) : undefined,
    actorId: String(row.actor_id),
    actorRole: String(row.actor_role),
    createdAt: String(row.created_at),
  };
}

export class GrievanceService {
  constructor(private readonly db: Database = getDatabase()) {
    migrate(this.db);
  }

  create(input: CreateGrievanceInput): Grievance {
    if (!input.subject?.trim()) throw new Error("Subject is required.");
    if (!input.description?.trim()) throw new Error("Description is required.");
    if (!input.category?.trim()) throw new Error("Category is required.");
    if (input.subject.length > 200) throw new Error("Subject is too long.");
    if (input.description.length > 5000) throw new Error("Description is too long.");
    if (input.category.length > 80) throw new Error("Category is too long.");
    if (input.location && input.location.length > 200) throw new Error("Location is too long.");

    // Idempotency: reuse an existing grievance for the same key+owner.
    if (input.idempotencyKey) {
      const existing = this.db
        .prepare(`SELECT * FROM grievances WHERE owner_id = ? AND idempotency_key = ?`)
        .get(input.ownerId, input.idempotencyKey);
      if (existing) return rowToGrievance(existing);
    }

    // Generate a unique reference (collision handling).
    let ref = cryptoRef();
    for (let i = 0; i < 8; i++) {
      const clash = this.db.prepare(`SELECT 1 FROM grievances WHERE reference_number = ?`).get(ref);
      if (!clash) break;
      ref = cryptoRef();
    }

    const id = newId();
    const now = nowIso();
    const attachments = input.attachments ?? [];
    const actorRole = input.actorRole ?? "citizen";

    // Atomic insert of grievance + initial history.
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `INSERT INTO grievances (id, reference_number, owner_id, subject, description, category, location, status, source, attachments_json, created_at, updated_at, idempotency_key)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          id,
          ref,
          input.ownerId,
          input.subject.trim(),
          input.description.trim(),
          input.category.trim(),
          (input.location ?? "").trim() || null,
          "SUBMITTED",
          input.source ?? "public-service",
          JSON.stringify(attachments),
          now,
          now,
          input.idempotencyKey ?? null
        );
      // Attach idempotency key column note: stored via migration (add below). For
      // now we rely on owner+key lookup via a separate table-less approach.
      this.db
        .prepare(
          `INSERT INTO grievance_status_history (id, grievance_id, previous_status, new_status, public_message, internal_note, actor_id, actor_role, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`
        )
        .run(newId(), id, null, "SUBMITTED", "Grievance submitted and recorded for tracking.", null, input.ownerId, actorRole, now);
      this.db.exec("COMMIT");
    } catch (e) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw e;
    }
    return this.get(id, input.ownerId)!;
  }

  get(id: string, ownerId: string): Grievance | null {
    const row = this.db.prepare(`SELECT * FROM grievances WHERE id = ? AND owner_id = ?`).get(id, ownerId);
    return row ? rowToGrievance(row) : null;
  }

  getAny(id: string): Grievance | null {
    const row = this.db.prepare(`SELECT * FROM grievances WHERE id = ?`).get(id);
    return row ? rowToGrievance(row) : null;
  }

  listQueue(opts: {
    category?: string;
    status?: string;
    location?: string;
    search?: string;
    sort?: "created_desc" | "created_asc" | "updated_desc";
    limit?: number;
    offset?: number;
  }): { items: GrievanceQueueItem[]; total: number } {
    const wh: string[] = [];
    const params: any = {};
    if (opts.category) { wh.push("category = :category"); params.category = opts.category; }
    if (opts.status) { wh.push("status = :status"); params.status = opts.status; }
    if (opts.location) { wh.push("location LIKE :location"); params.location = `%${opts.location}%`; }
    if (opts.search) { wh.push("(reference_number LIKE :search OR subject LIKE :search)"); params.search = `%${opts.search}%`; }
    const where = wh.length ? "WHERE " + wh.join(" AND ") : "";
    const totalRow = this.db.prepare(`SELECT COUNT(*) AS c FROM grievances ${where}`).all(params) as any[];
    const totalN = Number(totalRow?.[0]?.c ?? 0);
    const sortMap = {
      created_desc: "created_at DESC",
      created_asc: "created_at ASC",
      updated_desc: "updated_at DESC",
    };
    const order = sortMap[opts.sort ?? "created_desc"];
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
    const offset = Math.max(opts.offset ?? 0, 0);
    const rows = this.db
      .prepare(
        `SELECT id, reference_number, subject, category, location, status, created_at, updated_at
         FROM grievances ${where} ORDER BY ${order} LIMIT :limit OFFSET :offset`
      )
      .all({ ...params, limit, offset });
    const items: GrievanceQueueItem[] = (rows as any[]).map((r) => ({
      id: String(r.id),
      referenceNumber: String(r.reference_number),
      subject: String(r.subject),
      category: String(r.category),
      location: r.location ? String(r.location) : null,
      status: String(r.status),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
    return { items, total: totalN };
  }

  historyForStaff(id: string) {
    const row = this.db.prepare(`SELECT * FROM grievances WHERE id = ?`).get(id);
    if (!row) return null;
    const rows = this.db
      .prepare(`SELECT * FROM grievance_status_history WHERE grievance_id = ? ORDER BY created_at ASC`)
      .all(id)
      .map((r) => rowToHistory(r, true));
    return { status: rowToGrievance(row).status, history: rows };
  }

  duplicateHint(ownerId: string, subject: string, description: string, category: string, location?: string) {
    const STOP = new Set(["the","and","for","with","from","this","that","have","has","are","was","were","its","our","your","but","not","can","will","into","been"]);
    const tokens = [...new Set((subject+" "+description).toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])].filter(t=>!STOP.has(t));
    if (tokens.length === 0) return { possible: false, count: 0 };
    const rows = this.db.prepare(`SELECT subject, description, category, location, status FROM grievances WHERE owner_id = ?`).all(ownerId) as any[];
    let count = 0;
    for (const r of rows) {
      if (r.category !== category) continue;
      if (location && r.location && String(r.location).toLowerCase() !== location.toLowerCase()) continue;
      if (String(r.status) === "RESOLVED" || String(r.status) === "CLOSED") continue;
      const hay = (String(r.subject)+" "+String(r.description)).toLowerCase();
      const overlap = tokens.filter(t=>hay.includes(t)).length;
      if (overlap / Math.max(tokens.length,1) >= 0.6 || subject.trim().toLowerCase() === String(r.subject).trim().toLowerCase()) count++;
    }
    return { possible: count > 0, count };
  }

  analytics() {
    const byCategory = this.db.prepare(`SELECT category, COUNT(*) AS c FROM grievances GROUP BY category`).all();
    const byStatus = this.db.prepare(`SELECT status, COUNT(*) AS c FROM grievances GROUP BY status`).all();
    const total = Number((this.db.prepare(`SELECT COUNT(*) AS c FROM grievances`).get() as any)?.c ?? 0);
    return { total, byCategory, byStatus };
  }

  getByReference(ref: string, ownerId: string): Grievance | null {
    const row = this.db.prepare(`SELECT * FROM grievances WHERE reference_number = ? AND owner_id = ?`).get(ref, ownerId);
    return row ? rowToGrievance(row) : null;
  }

  list(ownerId: string, limit = 20, offset = 0): { items: Grievance[]; total: number } {
    const total = Number(
      (this.db.prepare(`SELECT COUNT(*) AS c FROM grievances WHERE owner_id = ?`).get(ownerId) as any)?.c ?? 0
    );
    const rows = this.db
      .prepare(`SELECT * FROM grievances WHERE owner_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(ownerId, Math.min(limit, 50), offset)
      .map(rowToGrievance);
    return { items: rows, total };
  }

  history(id: string, ownerId: string, includeInternal = false): { status: GrievanceStatus; history: StatusHistoryEntry[] } | null {
    const g = this.get(id, ownerId);
    if (!g) return null;
    const rows = this.db
      .prepare(`SELECT * FROM grievance_status_history WHERE grievance_id = ? ORDER BY created_at ASC`)
      .all(id)
      .map((r) => rowToHistory(r, includeInternal));
    return { status: g.status, history: rows };
  }

  updateStatus(
    id: string,
    ownerId: string,
    newStatus: GrievanceStatus,
    actorId: string,
    actorRole: string,
    publicMessage?: string,
    internalNote?: string
  ): Grievance | null {
    const g = this.get(id, ownerId);
    if (!g) return null;
    if (!ALLOWED_TRANSITIONS[g.status].includes(newStatus)) {
      throw new Error(`Invalid transition ${g.status} -> ${newStatus}`);
    }
    const now = nowIso();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`UPDATE grievances SET status = ?, updated_at = ? WHERE id = ?`).run(newStatus, now, id);
      this.db
        .prepare(
          `INSERT INTO grievance_status_history (id, grievance_id, previous_status, new_status, public_message, internal_note, actor_id, actor_role, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`
        )
        .run(newId(), id, g.status, newStatus, publicMessage ?? null, internalNote ?? null, actorId, actorRole, now);
      this.db.exec("COMMIT");
    } catch (e) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw e;
    }
    return this.get(id, ownerId);
  }
}

// Factory + singleton.
let singleton: GrievanceService | null = null;
export function getGrievanceService(): GrievanceService {
  if (!singleton) singleton = new GrievanceService();
  return singleton;
}
