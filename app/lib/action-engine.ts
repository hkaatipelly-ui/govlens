import type { DocumentAnalysis } from "../types/document-extraction";
import type { KnowledgeChunk } from "../types/knowledge-chunk";
import type { ChecklistItem } from "../types/checklist-item";
import type { Action } from "../types/action";

export interface ActionEngine {
  buildChecklist(analysis: DocumentAnalysis, evidence: KnowledgeChunk[]): ChecklistItem[];
  buildActions(analysis: DocumentAnalysis, evidence: KnowledgeChunk[]): Action[];
}

const REQUIRED_DOC_PATTERNS = [
  /required documents[:\s]+([^.]+)/i,
  /documents[:\s]+([^.]+)/i,
];

function splitList(raw: string): string[] {
  return raw
    .split(/[,;]|\band\b/i)
    .map((s) => s.trim().replace(/^(such as|like|including)\s+/i, ""))
    .filter((s) => s.length > 2 && s.length < 80)
    .slice(0, 6);
}

export class LocalActionEngine implements ActionEngine {
  buildChecklist(analysis: DocumentAnalysis, evidence: KnowledgeChunk[]): ChecklistItem[] {
    const items: ChecklistItem[] = [];
    const seen = new Set<string>();

    const push = (label: string, detail: string | undefined, sourceId: string | undefined) => {
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ id: `item-${items.length + 1}`, label, detail, sourceId, done: false });
    };

    for (const doc of analysis.extractedFields.requiredDocuments ?? []) {
      push(`Arrange: ${doc}`, "Carry original + 1 photocopy to the counter.", analysis.sources[0]?.id);
    }

    for (const chunk of evidence) {
      for (const pattern of REQUIRED_DOC_PATTERNS) {
        const m = chunk.text.match(pattern);
        if (m?.[1]) {
          for (const entry of splitList(m[1])) push(`Arrange: ${entry}`, `Per “${chunk.title}”.`, chunk.sourceId);
        }
      }
    }

    push("Visit the MeeSeva centre / office counter", "Take the acknowledgement receipt with application number.", evidence[0]?.sourceId);
    push("Track application status", "Use the acknowledgement / application number on the official portal.", evidence[0]?.sourceId);

    return items.slice(0, 8);
  }

  buildActions(analysis: DocumentAnalysis, evidence: KnowledgeChunk[]): Action[] {
    return this.buildChecklist(analysis, evidence).map((item) => ({
      id: item.id,
      title: item.label,
      description: item.detail ?? "",
      sourceId: item.sourceId,
    }));
  }
}

let singleton: ActionEngine | null = null;

export function getActionEngine(): ActionEngine {
  if (!singleton) singleton = new LocalActionEngine();
  return singleton;
}
