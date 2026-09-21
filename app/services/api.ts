import type { DocumentExtraction } from "@/lib/extraction/schemas";
import type { Explanation, Verification } from "@/lib/verification/schemas";
import type { KnowledgeHit } from "@/lib/knowledge/KnowledgeEngine";
import type { GovernmentSource } from "@/lib/sources/SourceService";
import type { Case, CaseStatus } from "@/lib/cases/CaseService";
import type { ChecklistItem } from "@/lib/actions/ActionEngine";

export type { DocumentExtraction, KnowledgeHit, GovernmentSource, Case, CaseStatus, ChecklistItem, Explanation, Verification };

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

export interface AnalyzeResponse {
  extraction: DocumentExtraction;
  explanation: Explanation;
  verification: Verification;
  cleanedText: string;
  sources: GovernmentSource[];
  sessionId: string;
  checklist: ChecklistItem[];
  grounded: boolean;
}

export async function apiHealth(): Promise<{
  status: "ok" | "degraded";
  ollama: boolean;
  modelAvailable: boolean;
  model: string;
  ok: boolean;
  detail: string;
}> {
  const res = await fetch("/api/health", { cache: "no-store" });
  return json(res);
}

export type AnalyzeStage =
  | "reading"
  | "checking-type"
  | "finding-info"
  | "understanding"
  | "explaining";

/** POST /api/analyze with honest server-sent progress (no fake delays). */
export async function apiAnalyze(
  text: string,
  opts: {
    language?: "en" | "te" | "hi";
    sessionId?: string;
    imageDataUrl?: string;
    onStage?: (stage: AnalyzeStage, label: string) => void;
  } = {}
): Promise<AnalyzeResponse> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      text,
      language: opts.language ?? "en",
      sessionId: opts.sessionId,
      imageDataUrl: opts.imageDataUrl,
    }),
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    return json<AnalyzeResponse>(res);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Streaming not supported by this browser.");
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const evt = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
      if (typeof evt.stage === "string" && opts.onStage) {
        opts.onStage(evt.stage as AnalyzeStage, String(evt.label ?? evt.stage));
      }
      if (evt.done === true) return evt as unknown as AnalyzeResponse;
      if (typeof evt.error === "string") throw new Error(evt.error as string);
    }
  }
  throw new Error("Analysis stream ended unexpectedly.");
}

export interface AskResponse {
  answer: string;
  sources: GovernmentSource[];
  language: string;
  grounded: boolean;
}

export async function apiAsk(
  question: string,
  opts: { sessionId?: string; documentText?: string; language?: "en" | "te" | "hi" } = {}
): Promise<AskResponse> {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      sessionId: opts.sessionId,
      documentText: opts.documentText,
      language: opts.language ?? "en",
    }),
  });
  return json(res);
}

export async function apiTranslate(
  text: string,
  targetLanguage: "en" | "te"
): Promise<{ translatedText: string }> {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, targetLanguage }),
  });
  return json(res);
}

export async function apiCreateCase(input: {
  sessionId: string;
  title?: string;
  language?: "en" | "te" | "hi";
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

export async function apiGetCase(id: string): Promise<{ case: Case }> {
  const res = await fetch(`/api/cases/${id}`, { cache: "no-store" });
  return json(res);
}

export async function apiPatchCase(id: string, status: CaseStatus): Promise<{ case: Case }> {
  const res = await fetch(`/api/cases/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  return json(res);
}

export async function apiSourceMetadata(ids: string[]): Promise<{ sources: GovernmentSource[] }> {
  const res = await fetch("/api/sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  return json(res);
}
