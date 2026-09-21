"use client";

import type { Answer } from "../types/answer";
import type { DocumentAnalysis } from "../types/document-extraction";
import type { KnowledgeChunk } from "../types/knowledge-chunk";
import type { ChecklistItem } from "../types/checklist-item";
import type { OCRResult } from "../types/ocr-result";

export interface QA {
  q: string;
  a: Answer;
}

export interface DocSession {
  imageUrl: string | null;
  ocr: OCRResult | null;
  text: string;
  analysis: DocumentAnalysis | null;
  evidence: KnowledgeChunk[];
  checklist: ChecklistItem[];
  qa: QA[];
  caseId: string | null;
}

const EMPTY: DocSession = {
  imageUrl: null,
  ocr: null,
  text: "",
  analysis: null,
  evidence: [],
  checklist: [],
  qa: [],
  caseId: null,
};

const KEY = "govlens-session-v1";

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
  if (!memory.text && !memory.analysis) {
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
  } catch {
    /* noop */
  }
}
