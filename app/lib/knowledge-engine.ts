import type {
  GovernmentDocument,
  SourceMetadata,
} from "../types/government-source";
import type { KnowledgeChunk } from "../types/knowledge-chunk";
import terminology from "../data/terminology.json";
import incomeDoc from "../data/documents/telangana/meeseva-income-certificate.json";
import rationDoc from "../data/documents/telangana/food-security-ration-card.json";
import dharaniDoc from "../data/documents/telangana/dharani-land-passbook.json";
import aadhaarDoc from "../data/documents/government-of-india/aadhaar-update.json";
import pmkisanDoc from "../data/documents/government-of-india/pmkisan.json";

export interface KnowledgeEngine {
  search(query: string): Promise<KnowledgeChunk[]>;
  getDocument(documentId: string): Promise<GovernmentDocument>;
  getSourceMetadata(sourceId: string): Promise<SourceMetadata>;
}

const CORPUS: GovernmentDocument[] = [
  incomeDoc as GovernmentDocument,
  rationDoc as GovernmentDocument,
  dharaniDoc as GovernmentDocument,
  aadhaarDoc as GovernmentDocument,
  pmkisanDoc as GovernmentDocument,
];

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function expandWithTerminology(tokens: Set<string>, text: string): void {
  const lower = text.toLowerCase();
  const terms = (terminology as { terms: Array<{ en: string; te?: string[]; keywords: string[] }> }).terms;
  for (const term of terms) {
    const aliases = [term.en, ...(term.te ?? []), ...term.keywords];
    if (aliases.some((a) => a && lower.includes(a.toLowerCase()))) {
      tokenize(term.en).forEach((t) => tokens.add(t));
      term.keywords.flatMap(tokenize).forEach((t) => tokens.add(t));
    }
  }
}

function scoreDoc(queryTokens: Set<string>, doc: GovernmentDocument): { score: number; matched: string[] } {
  const hay = `${doc.title} ${doc.department} ${doc.text}`.toLowerCase();
  const matched: string[] = [];
  let score = 0;
  for (const tok of queryTokens) {
    if (hay.includes(tok)) {
      score += tok.length > 5 ? 2 : 1;
      matched.push(tok);
    }
  }
  // Title matches weigh more
  const titleLower = doc.title.toLowerCase();
  for (const tok of queryTokens) {
    if (titleLower.includes(tok)) score += 2;
  }
  return { score, matched };
}

export class LocalKnowledgeEngine implements KnowledgeEngine {
  async search(query: string): Promise<KnowledgeChunk[]> {
    const tokens = new Set(tokenize(query));
    expandWithTerminology(tokens, query);
    if (tokens.size === 0) return [];

    const scored = CORPUS.map((doc) => {
      const { score, matched } = scoreDoc(tokens, doc);
      const chunk: KnowledgeChunk = {
        sourceId: doc.id,
        title: doc.title,
        department: doc.department,
        text: doc.text.slice(0, 900),
        score,
        matchedTerms: matched.slice(0, 8),
      };
      return chunk;
    })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, 3);
  }

  async getDocument(documentId: string): Promise<GovernmentDocument> {
    const doc = CORPUS.find((d) => d.id === documentId);
    if (!doc) throw new Error(`Unknown document: ${documentId}`);
    return doc;
  }

  async getSourceMetadata(sourceId: string): Promise<SourceMetadata> {
    const doc = await this.getDocument(sourceId);
    const { text: _text, ...meta } = doc;
    return meta;
  }
}

let singleton: LocalKnowledgeEngine | null = null;

export function getKnowledgeEngine(): KnowledgeEngine {
  if (!singleton) singleton = new LocalKnowledgeEngine();
  return singleton;
}
