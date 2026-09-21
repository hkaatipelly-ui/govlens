import type { DocumentAnalysis } from "./document-extraction";
import type { KnowledgeChunk } from "./knowledge-chunk";
import type { ChecklistItem } from "./checklist-item";

export type CaseStatus = "new" | "in_review" | "resolved";

export interface Case {
  id: string;
  createdAt: string;
  status: CaseStatus;
  language: "en" | "te" | "hi";
  documentText: string;
  ocrConfidence?: number;
  analysis: DocumentAnalysis;
  evidence: KnowledgeChunk[];
  checklist: ChecklistItem[];
  userNote?: string;
}
