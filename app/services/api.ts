import type { Answer } from "../types/answer";
import type { DocumentAnalysis } from "../types/document-extraction";
import type { Case } from "../types/case";
import type { KnowledgeChunk } from "../types/knowledge-chunk";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      /* keep default */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function apiHealth(): Promise<{ ok: boolean; model: string; detail: string; storage: string }> {
  const res = await fetch("/api/health", { cache: "no-store" });
  return json(res);
}

export async function apiAnalyze(text: string, language = "en"): Promise<{ analysis: DocumentAnalysis; evidence: KnowledgeChunk[] }> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language }),
  });
  return json(res);
}

export async function apiAsk(
  question: string,
  documentText: string,
  language: "en" | "te" | "hi" = "en"
): Promise<{ answer: Answer }> {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, documentText, language }),
  });
  return json(res);
}

export async function apiCreateCase(input: {
  documentText: string;
  ocrConfidence?: number;
  analysis: DocumentAnalysis;
  evidence: KnowledgeChunk[];
  checklist: ChecklistItemInput[];
  language: "en" | "te" | "hi";
  userNote?: string;
}): Promise<{ case: Case }> {
  const res = await fetch("/api/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return json(res);
}

export async function apiListCases(): Promise<{ cases: Case[] }> {
  const res = await fetch("/api/cases", { cache: "no-store" });
  return json(res);
}

export async function apiSourceMetadata(ids: string[]): Promise<{ sources: SourceMeta[] }> {
  const res = await fetch("/api/sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  return json(res);
}

interface SourceMeta {
  id: string;
  title: string;
  department: string;
  state: string;
  type: string;
  sourceUrl: string;
  language: string;
  publishedDate: string;
  effectiveDate: string;
  lastVerified: string;
}

interface ChecklistItemInput {
  id: string;
  label: string;
  detail?: string;
  sourceId?: string;
  done: boolean;
}
