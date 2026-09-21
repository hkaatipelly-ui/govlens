/**
 * LocalKnowledgeEngine: SQLite-backed keyword retrieval (server-only).
 * Sources are seeded from app/data/documents + terminology aliases.
 * Swap this class for an embedding implementation later without touching callers.
 */
import type { Database } from "../db/database";
import { getDatabase } from "../db/database";
import { migrate } from "../db/migrations";
import { chunkSource, type RawSource } from "./chunker";
import { scoreText, tokenize } from "./search";
import type {
  KnowledgeEngine,
  KnowledgeHit,
  SourceMetadata,
} from "./KnowledgeEngine";

import terminology from "@/app/data/terminology.json";
import incomeDoc from "@/app/data/documents/telangana/meeseva-income-certificate.json";
import rationDoc from "@/app/data/documents/telangana/food-security-ration-card.json";
import dharaniDoc from "@/app/data/documents/telangana/dharani-land-passbook.json";
import aadhaarDoc from "@/app/data/documents/government-of-india/aadhaar-update.json";
import pmkisanDoc from "@/app/data/documents/government-of-india/pmkisan.json";

const CORPUS: RawSource[] = [
  incomeDoc as RawSource,
  rationDoc as RawSource,
  dharaniDoc as RawSource,
  aadhaarDoc as RawSource,
  pmkisanDoc as RawSource,
];

function expandWithTerminology(tokens: Set<string>, text: string): void {
  const lower = text.toLowerCase();
  const terms = (terminology as { terms: Array<{ en: string; te?: string[]; keywords: string[] }> }).terms;
  for (const term of terms) {
    const aliases = [term.en, ...(term.te ?? []), ...term.keywords];
    if (aliases.some((a) => a && lower.includes(a.toLowerCase()))) {
      for (const t of term.en.toLowerCase().split(/\s+/)) if (t.length > 2) tokens.add(t);
      for (const k of term.keywords)
        for (const t of k.toLowerCase().split(/\s+/)) if (t.length > 2) tokens.add(t);
    }
  }
}

export class LocalKnowledgeEngine implements KnowledgeEngine {
  constructor(private readonly db: Database = getDatabase()) {
    migrate(this.db);
    this.seedIfEmpty();
  }

  private seedIfEmpty(): void {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM government_sources`).get();
    if (Number(row?.n ?? 0) > 0) return;
    const insertSource = this.db.prepare(
      `INSERT INTO government_sources
       (id, title, department, state, document_type, language, source_url, published_date, effective_date, last_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertChunk = this.db.prepare(
      `INSERT INTO knowledge_chunks (id, document_id, chunk_index, content, keywords_json)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const source of CORPUS) {
      insertSource.run(
        source.id, source.title, source.department, source.state, source.type,
        source.language, source.sourceUrl, source.publishedDate,
        source.effectiveDate, source.lastVerified
      );
      for (const chunk of chunkSource(source)) {
        insertChunk.run(chunk.id, chunk.documentId, chunk.chunkIndex, chunk.content, JSON.stringify(chunk.keywords));
      }
    }
  }

  async search(query: string, limit = 3): Promise<KnowledgeHit[]> {
    const tokens = new Set(tokenize(query));
    expandWithTerminology(tokens, query);
    if (tokens.size === 0) return [];
    const tokenArr = [...tokens];

    const chunks = this.db
      .prepare(
        `SELECT c.id AS chunk_id, c.document_id, c.content,
                s.title, s.department, s.state, s.document_type, s.language,
                s.source_url, s.published_date, s.effective_date, s.last_verified
         FROM knowledge_chunks c
         JOIN government_sources s ON s.id = c.document_id`
      )
      .all();

    // Aggregate per document: best chunk score wins, keep its content.
    const best = new Map<string, KnowledgeHit>();
    for (const row of chunks) {
      const title = String(row.title);
      const { score, matched } = scoreText(
        tokenArr,
        `${title} ${row.department} ${row.content}`,
        title
      );
      if (score <= 0) continue;
      const docId = String(row.document_id);
      const prev = best.get(docId);
      if (!prev || score > prev.score) {
        best.set(docId, {
          chunkId: String(row.chunk_id),
          documentId: docId,
          content: String(row.content),
          sourceMetadata: {
            id: docId,
            title,
            department: String(row.department),
            state: String(row.state),
            documentType: String(row.document_type),
            language: String(row.language),
            sourceUrl: String(row.source_url),
            publishedDate: String(row.published_date),
            effectiveDate: String(row.effective_date),
            lastVerified: String(row.last_verified),
          },
          score,
          matchedTerms: matched.slice(0, 8),
        });
      }
    }
    return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async getSource(documentId: string): Promise<SourceMetadata & { content: string }> {
    const row = this.db
      .prepare(`SELECT * FROM government_sources WHERE id = ?`)
      .get(documentId);
    if (!row) throw new Error(`Unknown source: ${documentId}`);
    const chunks = this.db
      .prepare(`SELECT content FROM knowledge_chunks WHERE document_id = ? ORDER BY chunk_index`)
      .all(documentId);
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
      content: chunks.map((c) => String(c.content)).join(" "),
    };
  }

  async getSources(documentIds: string[]): Promise<SourceMetadata[]> {
    const out: SourceMetadata[] = [];
    for (const id of documentIds.slice(0, 12)) {
      try {
        const { content: _c, ...meta } = await this.getSource(id);
        out.push(meta);
      } catch {
        /* skip unknown ids — never fabricate metadata */
      }
    }
    return out;
  }
}

let singleton: LocalKnowledgeEngine | null = null;

export function getKnowledgeEngine(): KnowledgeEngine {
  if (!singleton) singleton = new LocalKnowledgeEngine();
  return singleton;
}
