"use client";

import type { DocumentExtraction } from "@/lib/extraction/schemas";
import type { Explanation, Verification } from "@/lib/verification/schemas";
import type { KnowledgeHit } from "@/lib/knowledge/KnowledgeEngine";
import type { GovernmentSource } from "@/lib/sources/SourceService";
import type { ChecklistItem } from "@/lib/actions/ActionEngine";
import type { OCRResult } from "../types/ocr-result";

export interface QA {
  q: string;
  a: string;
  grounded: boolean;
  sources: GovernmentSource[];
}

export interface DocSession {
  sessionId: string | null;
  imageUrl: string | null;
  ocr: OCRResult | null;
  text: string;
  cleanedText: string | null;
  extraction: DocumentExtraction | null;
  verification: Verification | null;
  explanation: Explanation | null;
  continuedAnyway: boolean;
  grounded: boolean;
  evidence: KnowledgeHit[];
  sources: GovernmentSource[];
  checklist: ChecklistItem[];
  qa: QA[];
  caseId: string | null;
}

const EMPTY: DocSession = {
  sessionId: null,
  imageUrl: null,
  ocr: null,
  text: "",
  cleanedText: null,
  extraction: null,
  verification: null,
  explanation: null,
  continuedAnyway: false,
  grounded: false,
  evidence: [],
  sources: [],
  checklist: [],
  qa: [],
  caseId: null,
};

const KEY = "govlens-session-v2";

let memory: DocSession = { ...EMPTY };

function persist() {
  try {
    const { imageUrl: _img, ...rest } = memory;
    sessionStorage.setItem(KEY, JSON.stringify(rest));
  } catch {
    /* storage may be full/unavailable; memory still works */
  }
}

export function getSession(): DocSession {
  if (!memory.text && !memory.extraction) {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) memory = { ...EMPTY, ...(JSON.parse(raw) as Partial<DocSession>) };
    } catch {
      /* ignore */
    }
  }
  return memory;
}

export function updateSession(patch: Partial<DocSession>) {
  memory = { ...memory, ...patch };
  persist();
}

export function clearSession() {
  memory = { ...EMPTY };
  try {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem("govlens-session-v1");
  } catch {
    /* noop */
  }
}
