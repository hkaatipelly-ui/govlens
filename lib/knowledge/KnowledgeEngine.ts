/** KnowledgeEngine interface — retrieval contract, implementation-agnostic. */
export interface SourceMetadata {
  id: string;
  title: string;
  department: string;
  state: string;
  documentType: string;
  language: string;
  sourceUrl: string;
  publishedDate: string;
  effectiveDate: string;
  lastVerified: string;
}

export interface KnowledgeHit {
  chunkId: string;
  documentId: string;
  content: string;
  sourceMetadata: SourceMetadata;
  score: number;
  matchedTerms: string[];
}

export interface KnowledgeEngine {
  search(query: string, limit?: number): Promise<KnowledgeHit[]>;
  getSource(documentId: string): Promise<SourceMetadata & { content: string }>;
  getSources(documentIds: string[]): Promise<SourceMetadata[]>;
}
