export interface KnowledgeChunk {
  sourceId: string;
  title: string;
  department: string;
  text: string;
  score: number;
  matchedTerms: string[];
}
