/** SourceService — provenance for every grounded answer (server-only). */
import type { Database } from "../db/database";
import { getDatabase } from "../db/database";
import { migrate } from "../db/migrations";
import { LocalKnowledgeEngine } from "../knowledge/LocalKnowledgeEngine";
import type { SourceMetadata } from "../knowledge/KnowledgeEngine";

export interface GovernmentSource extends SourceMetadata {}

export class SourceService {
  constructor(private readonly db: Database = getDatabase()) {
    migrate(this.db);
    // Ensure corpus is seeded (engine constructor seeds if empty).
    void new LocalKnowledgeEngine(this.db);
  }

  async getSource(id: string): Promise<GovernmentSource> {
    const row = this.db
      .prepare(`SELECT * FROM government_sources WHERE id = ?`)
      .get(id);
    if (!row) throw new Error(`Unknown source: ${id}`);
    return rowToSource(row);
  }

  /** Returns metadata for known ids only — never fabricates. */
  async getSources(ids: string[]): Promise<GovernmentSource[]> {
    const out: GovernmentSource[] = [];
    for (const id of ids.slice(0, 12)) {
      try {
        out.push(await this.getSource(String(id)));
      } catch {
        /* skip unknown */
      }
    }
    return out;
  }

  async listAll(): Promise<GovernmentSource[]> {
    return this.db
      .prepare(`SELECT * FROM government_sources ORDER BY title`)
      .all()
      .map(rowToSource);
  }
}

function rowToSource(row: Record<string, unknown>): GovernmentSource {
  return {
    id: String(row.id),
    title: String(row.title),
    department: String(row.department),
    state: String(row.state),
    documentType: String(row.document_type),
    language: String(row.language),
    sourceUrl: String(row.source_url),
    publishedDate: String(row.published_date),
    effectiveDate: String(row.effective_date),
    lastVerified: String(row.last_verified),
  };
}

let singleton: SourceService | null = null;

export function getSourceService(): SourceService {
  if (!singleton) singleton = new SourceService();
  return singleton;
}
