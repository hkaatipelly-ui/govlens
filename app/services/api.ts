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
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      if (body.error) detail = body.error;
      if (body.code) code = body.code;
    } catch {
      /* keep default */
    }
    const err = new Error(detail) as Error & { code?: string };
    if (code) err.code = code;
    throw err;
  }
  return res.json() as Promise<T>;
}

export interface EntityDetail { type: string; value: string; page: number }

export interface DeepDetails {
  answers: Array<{ question: string; answer: string }>;
  findings: Array<{ title: string; detail: string; materiality: string }>;
  timeline: Array<{ date: string; event: string }>;
  contradictions: Array<{ category: string; explanation: string }>;
}

export interface SchemeDetails {
  schemeName: string | null;
  requirements: Array<{ requirement: string; status: string; explanation: string }>;
  documents: Array<{ documentName: string; state: string; whyRequired: string }>;
}

export interface LegalDetails {
  parties: Array<{ name: string; role: string }>;
  provisions: string[];
  header: { court: string | null; caseNumber: string | null; firNumber: string | null };
}

export interface VerificationRoute {
  claimId: string;
  adapterIds: string[];
  lookups: Array<{ adapterId: string; authority: string; sourceUrl: string; fields: Record<string, string>; instructions: string; automated: boolean }>;
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
  foundation?: { documentId: string; classification: string; entities: number; claims: number; evidence: number } | null;
  verificationRoutes?: VerificationRoute[];
  entityDetails?: EntityDetail[];
  deepDetails?: DeepDetails | null;
  schemeDetails?: SchemeDetails | null;
  legalDetails?: LegalDetails | null;
}

export interface GeminiHealthStatus {
  /** True when GEMINI_ENABLED=true and GEMINI_API_KEY is present. */
  configured: boolean;
  enabled: boolean;
  model: string;
  /** True when a public-service request could be served right now. */
  ok: boolean;
  lastOutcome: "ok" | "error" | null;
  lastErrorKind: string | null;
  detail: string;
}

export async function apiHealth(): Promise<{
  status: "ok" | "degraded";
  ollama: boolean;
  modelAvailable: boolean;
  model: string;
  gemini?: GeminiHealthStatus;
  ok: boolean;
  detail: string;
}> {
  const res = await fetch("/api/health", { cache: "no-store" });
  return json(res);
}

// --- Auth.js session status (primary; replaces the legacy owner status probe) ---

export interface AuthStatus {
  authenticated: boolean;
  role: "user" | "owner" | null;
}

/** Auth.js session probe: reads /api/auth/session and maps to a stable shape. */
export async function apiAuthStatus(): Promise<AuthStatus> {
  const res = await fetch("/api/auth/session", { cache: "no-store" });
  const session = await json<AuthJsSessionShape>(res);
  const user = session?.user ?? null;
  return {
    authenticated: Boolean(user?.id?.trim() || user?.email?.trim()),
    role: user?.role === "owner" ? "owner" : user ? "user" : null,
  };
}

interface AuthJsSessionShape {
  user?: { id?: string; email?: string | null; role?: "user" | "owner" } | null;
  expires?: string;
}

// NOTE: the legacy /api/owner/login owner-code route remains an independent
// server-only admin gate; its client helpers were removed from this module —
// no page or API flow depends on it anymore.

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
    fileName?: string | null;
    fileType?: "pdf" | "docx" | "jpeg" | "jpg" | "png" | null;
    provider?: "ollama" | "gemini";
    cloudConsent?: boolean;
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
      fileName: opts.fileName ?? undefined,
      fileType: opts.fileType ?? undefined,
      provider: opts.provider ?? "ollama",
      cloudConsent: opts.cloudConsent ?? false,
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
      if (typeof evt.error === "string") {
        const err = new Error(evt.error as string) as Error & { code?: string };
        if (typeof evt.code === "string") err.code = evt.code as string;
        throw err;
      }
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

export interface PublicAnswerSource {
  sourceId: string;
  title: string;
  url: string | null;
  sourceType: string;
  lastReviewed: string | null;
  relevantExcerpt: string;
}

export interface PublicAskResponse {
  answer: string;
  intent: string;
  supported: boolean;
  limitations: string;
  sources: PublicAnswerSource[];
  language: string;
  grounded: boolean;
}

export async function apiPublicAsk(
  question: string,
  language: "en" | "te" | "hi" = "en"
): Promise<PublicAskResponse> {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, language }),
  });
  return json(res);
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

export interface GrievanceShape {
  id: string;
  referenceNumber: string;
  subject: string;
  category: string;
  status: string;
  createdAt: string;
}

export async function apiCreateGrievance(input: {
  subject: string;
  description: string;
  category: string;
  location?: string;
  language?: "en" | "te" | "hi";
  idempotencyKey?: string;
}): Promise<{
  grievance: GrievanceShape;
}> {
  const res = await fetch("/api/grievances", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      subject: input.subject,
      description: input.description,
      category: input.category,
      location: input.location,
      language: input.language,
      idempotencyKey: input.idempotencyKey,
    }),
  });
  return json(res);
}

export async function apiListGrievances(
  limit = 20,
  offset = 0
): Promise<{ grievances: GrievanceShape[]; total: number }> {
  const res = await fetch(`/api/grievances?limit=${limit}&offset=${offset}`);
  return json(res);
}

export async function apiGetGrievance(id: string): Promise<{ grievance: any }> {
  const res = await fetch(`/api/grievances/${id}`);
  return json(res);
}

export async function apiGrievanceHistory(
  id: string
): Promise<{ status: string; history: any[] }> {
  const res = await fetch(`/api/grievances/${id}/history`);
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

// --- Caseworker (server-authorized; citizen endpoints stay owner-scoped) ---

export async function apiCaseworkerLogin(code: string): Promise<{ ok: boolean }> {
  const res = await fetch("/api/caseworker/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  return json(res);
}

export async function apiCaseworkerStatus(): Promise<{ authenticated: boolean }> {
  const res = await fetch("/api/caseworker/login", { cache: "no-store" });
  return json(res);
}

export async function apiListAllCases(): Promise<{ cases: Case[] }> {
  const res = await fetch("/api/caseworker/cases", { cache: "no-store" });
  return json(res);
}

export async function apiGetAnyCase(id: string): Promise<{ case: Case }> {
  const res = await fetch(`/api/caseworker/cases/${id}`, { cache: "no-store" });
  return json(res);
}
