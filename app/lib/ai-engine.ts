import type { Document } from "../types/document";
import type {
  DocumentAnalysis,
  ExtractedFields,
} from "../types/document-extraction";
import type { Answer } from "../types/answer";
import { UNVERIFIED_FALLBACK } from "../types/answer";
import type { KnowledgeChunk } from "../types/knowledge-chunk";
import type { Source } from "../types/government-source";

export interface AIEngine {
  analyzeDocument(document: Document): Promise<DocumentAnalysis>;
  answerQuestion(question: string, context: string): Promise<Answer>;
  extractFields(document: Document): Promise<ExtractedFields>;
}

export class AIEngineUnavailableError extends Error {
  constructor(message = "Local AI (Ollama) is unavailable.") {
    super(message);
    this.name = "AIEngineUnavailableError";
  }
}

export const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma3:4b";

const GROUND_RULES = `You are GovLens, a helper for Indian government documents.
STRICT RULES:
- Use ONLY the official evidence provided below. Never invent deadlines, fees, eligibility, required documents, or procedures.
- If the evidence does not contain the answer, reply EXACTLY: "${UNVERIFIED_FALLBACK}"
- Reply in the requested language (English or Telugu).
- For analysis, respond with ONLY valid JSON matching the schema requested. No markdown fences, no extra text.`;

function evidenceBlock(evidence: KnowledgeChunk[]): string {
  if (evidence.length === 0) return "(no official evidence retrieved)";
  return evidence
    .map((c) => `[source:${c.sourceId}] ${c.title} — ${c.department}\n${c.text}`)
    .join("\n\n");
}

function sourcesFrom(evidence: KnowledgeChunk[]): Source[] {
  return evidence.map((c) => ({ id: c.sourceId, title: c.title, department: c.department }));
}

interface OllamaChatResponse {
  message?: { content?: string };
  error?: string;
}

async function chatOllama(system: string, prompt: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    });
  } catch {
    throw new AIEngineUnavailableError(
      "Could not reach Ollama at localhost:11434. Start it with `ollama serve` and pull `gemma3:4b`."
    );
  }
  if (!res.ok) {
    if (res.status === 404) {
      throw new AIEngineUnavailableError(
        `Ollama model “${OLLAMA_MODEL}” not found. Run: ollama pull ${OLLAMA_MODEL}`
      );
    }
    throw new AIEngineUnavailableError(`Ollama returned HTTP ${res.status}. Is the model loaded?`);
  }
  const data = (await res.json()) as OllamaChatResponse;
  if (data.error) throw new AIEngineUnavailableError(`Ollama error: ${data.error}`);
  const content = data.message?.content?.trim() ?? "";
  if (!content) throw new Error("Empty response from local AI.");
  return content;
}

export function stripCodeFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(stripCodeFences(raw)) as T;
  } catch {
    return null;
  }
}

interface RawAnalysis {
  documentType?: unknown;
  language?: unknown;
  summary?: unknown;
  summaryTelugu?: unknown;
  extractedFields?: {
    documentType?: unknown;
    applicantName?: unknown;
    applicationId?: unknown;
    dates?: unknown;
    amounts?: unknown;
    requiredDocuments?: unknown;
    deadlines?: unknown;
    officeOrDepartment?: unknown;
  };
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string").slice(0, 12);
  return [];
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/** Validate model JSON before rendering. Returns null when invalid. */
export function validateAnalysisJson(raw: string): DocumentAnalysis | null {
  const parsed = safeJsonParse<RawAnalysis>(raw);
  if (!parsed || typeof parsed !== "object") return null;
  if (typeof parsed.summary !== "string" || !parsed.summary.trim()) return null;
  const ef = parsed.extractedFields ?? {};
  if (typeof ef !== "object") return null;
  const analysis: DocumentAnalysis = {
    documentType: asString(parsed.documentType, "Unknown document"),
    language: asString(parsed.language, "en"),
    summary: parsed.summary.trim(),
    summaryTelugu: typeof parsed.summaryTelugu === "string" ? parsed.summaryTelugu : undefined,
    extractedFields: {
      documentType: typeof ef.documentType === "string" ? ef.documentType : undefined,
      applicantName: typeof ef.applicantName === "string" ? ef.applicantName : undefined,
      applicationId: typeof ef.applicationId === "string" ? ef.applicationId : undefined,
      dates: asStringArray(ef.dates),
      amounts: asStringArray(ef.amounts),
      requiredDocuments: asStringArray(ef.requiredDocuments),
      deadlines: asStringArray(ef.deadlines),
      officeOrDepartment: typeof ef.officeOrDepartment === "string" ? ef.officeOrDepartment : undefined,
    },
    sources: [],
    verified: true,
  };
  return analysis;
}

function fallbackAnalysis(document: Document, evidence: KnowledgeChunk[]): DocumentAnalysis {
  // Rule-based fallback used ONLY when the model returns malformed JSON.
  // Never invents facts: summary is generic, fields stay empty, verified=false.
  const top = evidence[0];
  return {
    documentType: "Government document (unverified parse)",
    language: document.language || "en",
    summary:
      "The document text was read, but the local AI returned an unexpected format, so GovLens cannot summarize it reliably yet. " +
      (top
        ? `Possibly related official information: “${top.title}” (${top.department}). Please retry analysis or ask a question below.`
        : "No matching official information was found. Please retry analysis.") +
      " " + UNVERIFIED_FALLBACK,
    extractedFields: {
      dates: [],
      amounts: [],
      requiredDocuments: [],
      deadlines: [],
    },
    sources: sourcesFrom(evidence),
    verified: false,
  };
}

export interface EngineEvidence {
  chunks: KnowledgeChunk[];
}

/**
 * Ollama-backed implementation of AIEngine using Gemma 3 4B locally.
 * The rest of the app must depend on AIEngine, never on Ollama directly.
 */
export class OllamaGemmaEngine implements AIEngine {
  constructor(private readonly evidenceProvider?: (query: string) => Promise<KnowledgeChunk[]>) {}

  async analyzeDocument(document: Document): Promise<DocumentAnalysis> {
    const evidence = await this.evidenceFor(document.content);
    const prompt = `Analyze this government document and respond with ONLY JSON:
{"documentType": string, "language": "en"|"te", "summary": string (plain language, <=120 words, grounded in evidence), "summaryTelugu": string (Telugu translation of summary), "extractedFields": {"documentType": string, "applicantName": string, "applicationId": string, "dates": string[], "amounts": string[], "requiredDocuments": string[], "deadlines": string[], "officeOrDepartment": string}}

OFFICIAL EVIDENCE:
${evidenceBlock(evidence)}

DOCUMENT TEXT:
${document.content.slice(0, 4000)}`;

    const raw = await chatOllama(GROUND_RULES, prompt);
    const validated = validateAnalysisJson(raw);
    if (!validated) return fallbackAnalysis(document, evidence);
    validated.sources = sourcesFrom(evidence);
    validated.verified = evidence.length > 0;
    if (evidence.length === 0) {
      validated.summary += " " + UNVERIFIED_FALLBACK;
    }
    return validated;
  }

  async answerQuestion(question: string, context: string): Promise<Answer> {
    const evidence = await this.evidenceFor(`${question}\n${context.slice(0, 2000)}`);
    const scriptHindi = /[\u0900-\u097F]/.test(question);
    const scriptTelugu = /[\u0C00-\u0C7F]/.test(question);
    const wantsHindi = scriptHindi || /\[Reply in Hindi\.?\]/.test(question);
    const cleanQuestion = question.replace(/\[Reply in Hindi\.?\]/, "").trim();
    const replyLang = wantsHindi ? "Hindi" : scriptTelugu ? "Telugu" : "English";
    const prompt = `Answer the citizen's question using ONLY the official evidence and the current document. Respond with ONLY JSON: {"answer": string (<=120 words), "verified": boolean}. If evidence is insufficient, set answer to EXACTLY "${UNVERIFIED_FALLBACK}" and verified=false. Reply in ${replyLang}.

OFFICIAL EVIDENCE:
${evidenceBlock(evidence)}

CURRENT DOCUMENT:
${context.slice(0, 3000)}

QUESTION: ${cleanQuestion || question}`;

    const raw = await chatOllama(GROUND_RULES, prompt);
    const parsed = safeJsonParse<{ answer?: unknown; verified?: unknown }>(raw);
    if (!parsed || typeof parsed.answer !== "string" || !parsed.answer.trim()) {
      return { text: UNVERIFIED_FALLBACK, sources: sourcesFrom(evidence), verified: false };
    }
    const text = parsed.answer.trim();
    const verified = parsed.verified === true && text !== UNVERIFIED_FALLBACK && evidence.length > 0;
    return { text, sources: sourcesFrom(evidence), verified };
  }

  async extractFields(document: Document): Promise<ExtractedFields> {
    const analysis = await this.analyzeDocument(document);
    return analysis.extractedFields;
  }

  private async evidenceFor(query: string): Promise<KnowledgeChunk[]> {
    if (!this.evidenceProvider) return [];
    try {
      return await this.evidenceProvider(query);
    } catch {
      return [];
    }
  }
}

let singleton: AIEngine | null = null;

/** App-wide accessor. Wires OllamaGemmaEngine to the local KnowledgeEngine lazily (avoids import cycles). */
export async function getAIEngine(): Promise<AIEngine> {
  if (!singleton) {
    const { getKnowledgeEngine } = await import("./knowledge-engine");
    const kb = getKnowledgeEngine();
    singleton = new OllamaGemmaEngine((q) => kb.search(q));
  }
  return singleton;
}

export async function checkOllamaHealth(): Promise<{ ok: boolean; model: string; detail: string }> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) return { ok: false, model: OLLAMA_MODEL, detail: `Ollama HTTP ${res.status}` };
    const data = (await res.json()) as { models?: Array<{ name?: string; model?: string }> };
    const names = (data.models ?? []).map((m) => m.name ?? m.model ?? "");
    const hasModel = names.some((n) => n.startsWith(OLLAMA_MODEL.split(":")[0]));
    if (!hasModel) {
      return {
        ok: false,
        model: OLLAMA_MODEL,
        detail: `Ollama is running but model “${OLLAMA_MODEL}” is missing. Run: ollama pull ${OLLAMA_MODEL}`,
      };
    }
    return { ok: true, model: OLLAMA_MODEL, detail: "Local AI ready." };
  } catch {
    return {
      ok: false,
      model: OLLAMA_MODEL,
      detail: "Ollama is not reachable at localhost:11434. Start it with `ollama serve`.",
    };
  }
}
