/** ActionEngine — checklists from extraction + evidence (no model calls). */
import type { DocumentExtraction } from "../extraction/schemas";
import type { KnowledgeHit } from "../knowledge/KnowledgeEngine";

export interface ChecklistItem {
  id: string;
  label: string;
  detail?: string;
  sourceId?: string;
  done: boolean;
}

export interface ActionEngine {
  buildChecklist(extraction: DocumentExtraction, evidence: KnowledgeHit[]): ChecklistItem[];
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
  buildChecklist(extraction: DocumentExtraction, evidence: KnowledgeHit[]): ChecklistItem[] {
    const items: ChecklistItem[] = [];
    const seen = new Set<string>();

    const push = (label: string, detail: string | undefined, sourceId: string | undefined) => {
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ id: `item-${items.length + 1}`, label, detail, sourceId, done: false });
    };

    for (const doc of extraction.requiredDocuments ?? []) {
      push(`Arrange: ${doc}`, "Carry original + 1 photocopy to the counter.", extraction.sourceIds[0]);
    }
    for (const action of extraction.requiredActions ?? []) {
      push(action, undefined, extraction.sourceIds[0]);
    }

    for (const hit of evidence) {
      for (const pattern of REQUIRED_DOC_PATTERNS) {
        const m = hit.content.match(pattern);
        if (m?.[1]) {
          for (const entry of splitList(m[1]))
            push(`Arrange: ${entry}`, `Per "${hit.sourceMetadata.title}".`, hit.documentId);
        }
      }
    }

    push(
      "Visit the MeeSeva centre / office counter",
      "Take the acknowledgement receipt with application number.",
      evidence[0]?.documentId
    );
    push(
      "Track application status",
      "Use the acknowledgement / application number on the official portal.",
      evidence[0]?.documentId
    );

    return items.slice(0, 8);
  }
}

let singleton: ActionEngine | null = null;

export function getActionEngine(): ActionEngine {
  if (!singleton) singleton = new LocalActionEngine();
  return singleton;
}
