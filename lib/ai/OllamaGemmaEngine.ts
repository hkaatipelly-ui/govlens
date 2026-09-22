/**
 * OllamaGemmaEngine — server-only Ollama integration (Gemma 3 4B).
 *
 * Config via env with safe defaults (never hard-coded at call sites):
 *   OLLAMA_BASE_URL (default http://localhost:11434)
 *   OLLAMA_MODEL    (default gemma3:4b)
 *
 * Guarantees:
 * - Server-side only (browser never calls Ollama).
 * - Deterministic extraction: temperature 0 + Ollama JSON-schema `format`.
 * - Zod validation of every model response; max 1 retry, then controlled fallback.
 * - Server-side timeouts (no endless waits).
 * - Gemma vision input for document verification (downscaled images only).
 */
import {
  AIEngineUnavailableError,
  AITimeoutError,
  type ActionPlanInput,
  type AIEngine,
  type AnalysisResult,
  type AnswerResult,
  type CleanupInput,
  type DocumentAnalysisInput,
  type ExplainInput,
  type ExtractInput,
  type QuestionInput,
  type TranslationInput,
  type TranslationResult,
  type VerifyInput,
} from "./AIEngine";
import {
  groundedAnswerSchema,
  safeJsonParse,
  unverifiedExtractionFallback,
  validateExtractionJson,
  type DocumentExtraction,
} from "../extraction/schemas";
import {
  actionPlanSchema,
  explanationSchema,
  ocrCleanupSchema,
  uncertainVerificationFallback,
  verificationSchema,
  type ActionPlan,
  type Explanation,
  type OcrCleanup,
  type Verification,
} from "../verification/schemas";
import type { KnowledgeHit } from "../knowledge/KnowledgeEngine";

export { AIEngineUnavailableError, AITimeoutError };

export const UNVERIFIED_FALLBACK =
  "I could not verify this from the official information available to GovLens.";

export const ASK_FALLBACK =
  "I couldn't verify that from this document or the official information available to GovLens.";

export function ollamaBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
}

export function ollamaModel(): string {
  return process.env.OLLAMA_MODEL ?? "gemma3:4b";
}

// Server-side AI request budget. Gemma 3 4B on local Metal runs ~12 t/s, so a
// full structured extraction can exceed 90s — 180s default, overridable.
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 180000);

// Cap on MODEL OUTPUT tokens only (never truncates user document text — the
// structured schemas below need ~200-300 tokens; 512 leaves safe headroom).
const NUM_PREDICT = Number(process.env.OLLAMA_NUM_PREDICT ?? 512);

const GROUND_RULES = `You are GovLens, an AI assistant for Indian government documents. You are NOT a government authority and must NOT claim to be one. You do NOT authenticate physical documents.
STRICT RULES:
- Use ONLY the official evidence provided below. Never invent deadlines, fees, eligibility, required documents, or procedures.
- Distinguish information found IN THE CURRENT DOCUMENT from general knowledge-base context.
- Every factual claim must come from the evidence or the document. If the evidence does not contain the answer, reply with the unverified fallback.
- Return source IDs exactly as given.
- Respond with ONLY valid JSON matching the requested schema. No markdown fences, no extra text.`;

function evidenceBlock(evidence: KnowledgeHit[]): string {
  if (evidence.length === 0) return "(no official evidence retrieved)";
  return evidence
    .map(
      (h) =>
        `[source:${h.documentId}] ${h.sourceMetadata.title} — ${h.sourceMetadata.department} (${h.sourceMetadata.state}, verified ${h.sourceMetadata.lastVerified}, ${h.sourceMetadata.sourceUrl})\n${h.content}`
    )
    .join("\n\n");
}

interface OllamaChatResponse {
  message?: { content?: string };
  error?: string;
}

interface ChatOptions {
  /** "json" for free-form JSON, or a JSON-schema object for constrained output. */
  format?: "json" | Record<string, unknown>;
  /** Base64 images (no data: prefix) for Gemma vision input. */
  images?: string[];
  timeoutMs?: number;
}

async function chatOllama(
  system: string,
  prompt: string,
  opts: ChatOptions = {}
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? OLLAMA_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${ollamaBaseUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: ollamaModel(),
        stream: false,
        format: opts.format ?? "json",
        options: { temperature: 0, num_predict: NUM_PREDICT },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: prompt,
            ...(opts.images?.length ? { images: opts.images } : {}),
          },
        ],
      }),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new AITimeoutError();
    }
    throw new AIEngineUnavailableError(
      "Could not reach Ollama at localhost:11434. Start it with `ollama serve` and pull `gemma3:4b`."
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    if (res.status === 404) {
      throw new AIEngineUnavailableError(
        `Ollama model "${ollamaModel()}" not found. Run: ollama pull ${ollamaModel()}`
      );
    }
    throw new AIEngineUnavailableError(
      `Ollama returned HTTP ${res.status}. Is the model loaded?`
    );
  }
  const data = (await res.json()) as OllamaChatResponse;
  if (data.error) throw new AIEngineUnavailableError(`Ollama error: ${data.error}`);
  const content = data.message?.content?.trim() ?? "";
  if (!content) throw new Error("Empty response from local AI.");
  return content;
}

/** Parse + Zod-validate with max 1 retry using a stricter correction prompt. */
async function validatedCall<T>(
  system: string,
  prompt: string,
  validate: (raw: string) => T | null,
  opts: ChatOptions = {},
  logTag = "GovLens"
): Promise<T | null> {
  let raw = await chatOllama(system, prompt, opts);
  let out = validate(raw);
  if (!out) {
    console.warn(`[${logTag}] model JSON invalid (length ${raw.length}); retrying once.`);
    raw = await chatOllama(
      system,
      prompt + "\n\nYour previous reply was not valid JSON for the required schema. Reply with ONLY the JSON object.",
      opts
    );
    out = validate(raw);
    if (!out) console.warn(`[${logTag}] model JSON invalid twice; using controlled fallback.`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Prompt builders (exported for tests)
// ---------------------------------------------------------------------------

export function buildAnalysisPrompt(text: string, evidence: KnowledgeHit[]): string {
  return `Analyze this government document and respond with ONLY JSON matching this schema:
{"documentType": string, "title": string|null, "organization": string|null, "summary": string (plain language, <=120 words, grounded in evidence), "summaryTelugu": string (Telugu translation of the summary), "deadline": string|null (look carefully: collection dates, "after N days", last dates — copy exact wording, else null), "amount": string|null (look carefully: Rs amounts, fees paid — copy exact wording, else null), "referenceNumber": string|null (look carefully: application/acknowledgement/receipt numbers like MSC..., IDs — copy exactly, else null), "requiredDocuments": string[] (from evidence; include at least the main ones when evidence lists them, else []), "requiredActions": string[] (concrete next steps from evidence, else []), "warningSignals": string[] (anything needing verification, e.g. unexpected payment instructions, urgent action, contact mismatches), "language": "en"|"te", "sourceIds": string[] (echo the [source:...] ids you used)}

OFFICIAL EVIDENCE:
${evidenceBlock(evidence)}

CURRENT DOCUMENT TEXT (structured OCR):
${text.slice(0, 4000)}`;
}

export function buildQuestionPrompt(
  question: string,
  documentText: string,
  evidence: KnowledgeHit[],
  replyLang: string,
  extractionSummary?: string,
  history?: Array<{ role: string; content: string }>
): string {
  const historyBlock = (history ?? [])
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Citizen" : "GovLens"}: ${m.content.slice(0, 400)}`)
    .join("\n");
  return `Answer the citizen's question about the CURRENT document below, using ONLY the official evidence and the document. Stay scoped to this document and its evidence. Respond with ONLY JSON: {"answer": string (<=120 words), "verified": boolean}. If evidence is insufficient, set answer to EXACTLY "${ASK_FALLBACK}" and verified=false. Reply in ${replyLang}.

OFFICIAL EVIDENCE:
${evidenceBlock(evidence)}

CURRENT DOCUMENT:
${documentText.slice(0, 3000)}
${extractionSummary ? `\nCACHED EXTRACTION SUMMARY:\n${extractionSummary.slice(0, 800)}` : ""}
${historyBlock ? `\nRECENT CONVERSATION (same document):\n${historyBlock}` : ""}
QUESTION: ${question}`;
}

export function buildCleanupPrompt(rawText: string): string {
  return `Clean up this OCR text from a photographed document and respond with ONLY JSON: {"cleanedText": string (fix obvious spacing/line-break issues, preserve original wording, NEVER invent missing text, preserve all numbers/dates/reference numbers exactly), "language": "en"|"te"|"hi"|"mixed", "confidence": number 0-1 (your confidence the text is readable), "warnings": string[] (e.g. heavy OCR noise, unreadable sections)}.

RAW OCR TEXT:
${rawText.slice(0, 6000)}`;
}

export function buildVerifyPrompt(ocrText: string, language: string): string {
  return `Decide whether this document appears to be an Indian government/public-service document (STAGES A+B: type classification + content likelihood) and respond with ONLY JSON: {"status": one of "likely_government"|"uncertain"|"not_government" (never "verified" — that requires official source matching done separately), "confidence": number 0-1, "documentType": string (e.g. notice, application, certificate, receipt, form, unknown), "organization": string|null (department/authority if named), "reasons": string[] (cite government terminology, department references, reference numbers, scheme names, or their absence), "matchedSources": [] (leave empty), "verificationWarnings": string[] (e.g. private/commercial content, suspicious payment requests), "visualSignals": [] (leave empty, no image provided)}.
Evaluate: government/authority terminology, department references, official structure, reference numbers, scheme/service names, Indian administrative terms, and whether it looks private/commercial instead.

DOCUMENT TEXT:
${ocrText.slice(0, 4000)}
Declared language: ${language}`;
}

export function buildVisionPrompt(): string {
  return `Look at this photographed document and assess ONLY visual signals (STAGE C) and respond with ONLY JSON: {"status": one of "likely_government"|"uncertain"|"not_government", "confidence": number 0-1, "documentType": string, "organization": string|null, "reasons": string[], "matchedSources": [], "verificationWarnings": string[], "visualSignals": string[] (layout, letterhead-style headings, tables, stamps/seals appearance)}.
IMPORTANT: logos, seals, letterheads and formatting are ONLY weak signals, never proof of authenticity. Say so in verificationWarnings if such elements are the only signals.`;
}

export function buildExplainPrompt(
  text: string,
  extraction: DocumentExtraction,
  evidence: KnowledgeHit[],
  language: string
): string {
  const replyLang = language === "te" ? "Telugu" : language === "hi" ? "Hindi" : "English";
  return `You are GovLens. Explain the supplied government/public-service document in simple ${replyLang} and respond with ONLY JSON: {"summary": string (<=120 words), "importantPoints": string[] (at least 3 key facts grounded in extraction/evidence), "whatToDo": string[] (at least 2 concrete next steps), "deadline": string (copy from extraction or "" if unknown), "amount": string (copy from extraction or "" if unknown), "verificationNote": string (one line on what to double-check at the counter), "sourceIds": string[]}.
Use only the document and official retrieved evidence. Do not invent eligibility, fees, deadlines, required documents or procedures. If information is unavailable or conflicting, say it could not be verified. Clearly distinguish: (1) information stated in the document, (2) information from official sources, (3) unverified information.

STRUCTURED EXTRACTION:
${JSON.stringify(extraction).slice(0, 2500)}

OFFICIAL EVIDENCE:
${evidenceBlock(evidence)}

DOCUMENT TEXT:
${text.slice(0, 2500)}`;
}

export function buildActionPlanPrompt(
  extraction: DocumentExtraction,
  evidence: KnowledgeHit[]
): string {
  return `Turn this analyzed government document into a citizen action plan and respond with ONLY JSON: {"actions": [{"title": string, "detail": string}] (ordered steps, grounded in extraction/evidence only), "reminders": string[] (e.g. carry originals, note the deadline), "deadline": string|null, "sourceIds": string[]}. Do NOT submit forms or invent procedures.

EXTRACTION:
${JSON.stringify(extraction).slice(0, 2500)}

OFFICIAL EVIDENCE:
${evidenceBlock(evidence)}`;
}

// JSON-schema formats for constrained decoding (extraction + explanation).
const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    documentType: { type: "string" },
    title: { type: ["string", "null"] },
    organization: { type: ["string", "null"] },
    summary: { type: "string" },
    summaryTelugu: { type: "string" },
    deadline: { type: ["string", "null"] },
    amount: { type: ["string", "null"] },
    referenceNumber: { type: ["string", "null"] },
    requiredDocuments: { type: "array", items: { type: "string" } },
    requiredActions: { type: "array", items: { type: "string" } },
    warningSignals: { type: "array", items: { type: "string" } },
    language: { type: "string" },
    sourceIds: { type: "array", items: { type: "string" } },
  },
  required: ["documentType", "summary", "requiredDocuments", "language", "sourceIds"],
};

const EXPLANATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    importantPoints: { type: "array", items: { type: "string" } },
    whatToDo: { type: "array", items: { type: "string" } },
    deadline: { type: "string" },
    amount: { type: "string" },
    verificationNote: { type: "string" },
    sourceIds: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "sourceIds"],
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class OllamaGemmaEngine implements AIEngine {
  async cleanupOcrText(input: CleanupInput): Promise<OcrCleanup> {
    const out = await validatedCall(
      "You clean noisy OCR text precisely without inventing content. Respond with ONLY valid JSON.",
      buildCleanupPrompt(input.rawText),
      (raw) => {
        const parsed = safeJsonParse<unknown>(raw);
        if (!parsed) return null;
        const res = ocrCleanupSchema.safeParse(parsed);
        return res.success ? res.data : null;
      },
      {},
      "GovLens/cleanup"
    );
    if (out) return out;
    return {
      cleanedText: input.rawText.trim(),
      language: "en",
      confidence: 0.4,
      warnings: ["Automatic cleanup failed — using raw OCR text."],
    };
  }

  /** Stages A+B: content-based classification (never "verified" at this stage). */
  async verifyGovernmentDocument(input: VerifyInput): Promise<Verification> {
    const hasImage = !!input.imageDataUrl;
    const out = await validatedCall(
      GROUND_RULES,
      hasImage ? buildVisionPrompt() : buildVerifyPrompt(input.ocrText, input.language ?? "en"),
      (raw) => {
        const parsed = safeJsonParse<unknown>(raw);
        if (!parsed) return null;
        const res = verificationSchema.safeParse(parsed);
        return res.success ? res.data : null;
      },
      hasImage ? { images: [stripDataUrl(input.imageDataUrl!)] } : {},
      "GovLens/verify"
    );
    if (out) {
      // Hard rule: text/vision stages alone can never declare "verified".
      if (out.status === "verified") out.status = "likely_government";
      return out;
    }
    return uncertainVerificationFallback();
  }

  async extractDocumentFields(input: ExtractInput): Promise<DocumentExtraction> {
    const prompt = buildAnalysisPrompt(input.text, input.evidence);
    const out = await validatedCall(GROUND_RULES, prompt, validateExtractionJson, {
      format: EXTRACTION_JSON_SCHEMA,
    }, "GovLens/extract");
    if (out) {
      return {
        ...out,
        language: input.language,
        sourceIds: input.evidence.map((h) => h.documentId),
      };
    }
    const fallback = unverifiedExtractionFallback(input.language);
    fallback.sourceIds = input.evidence.map((h) => h.documentId);
    return fallback;
  }

  async explainDocument(input: ExplainInput): Promise<Explanation> {
    const out = await validatedCall(
      GROUND_RULES,
      buildExplainPrompt(input.text, input.extraction, input.evidence, input.language),
      (raw) => {
        const parsed = safeJsonParse<unknown>(raw);
        if (!parsed) return null;
        const res = explanationSchema.safeParse(parsed);
        return res.success ? res.data : null;
      },
      { format: EXPLANATION_JSON_SCHEMA },
      "GovLens/explain"
    );
    if (out) return { ...out, sourceIds: input.evidence.map((h) => h.documentId) };
    return {
      summary: input.extraction.summary,
      importantPoints: [],
      whatToDo: input.extraction.requiredActions.slice(0, 5),
      deadline: input.extraction.deadline ?? "",
      amount: input.extraction.amount ?? "",
      verificationNote: UNVERIFIED_FALLBACK,
      sourceIds: input.evidence.map((h) => h.documentId),
    };
  }

  async analyzeDocument(input: DocumentAnalysisInput): Promise<AnalysisResult> {
    const extraction = await this.extractDocumentFields({
      text: input.text,
      language: input.language,
      evidence: input.evidence,
    });
    const grounded =
      input.evidence.length > 0 && !extraction.documentType.startsWith("Government document (unverified");
    const finalExtraction: DocumentExtraction = grounded
      ? extraction
      : {
          ...extraction,
          summary: `${extraction.summary} ${UNVERIFIED_FALLBACK}`,
        };
    return { extraction: finalExtraction, grounded };
  }

  async answerQuestion(input: QuestionInput): Promise<AnswerResult> {
    const replyLang =
      input.language === "hi" ? "Hindi" : input.language === "te" ? "Telugu" : "English";
    const prompt = buildQuestionPrompt(
      input.question,
      input.documentText,
      input.evidence,
      replyLang,
      input.extractionSummary,
      input.history
    );
    const raw = await chatOllama(GROUND_RULES, prompt);
    let parsed = safeJsonParse<{ answer?: unknown; verified?: unknown }>(raw);
    if (!parsed || typeof parsed.answer !== "string") {
      console.warn("[GovLens/ask] model JSON invalid; retrying once.");
      const retry = await chatOllama(
        GROUND_RULES,
        prompt + "\n\nYour previous reply was not valid JSON. Reply with ONLY the JSON object."
      );
      parsed = safeJsonParse<{ answer?: unknown; verified?: unknown }>(retry);
    }
    if (!parsed || typeof parsed.answer !== "string" || !parsed.answer.trim()) {
      return { answer: ASK_FALLBACK, grounded: false };
    }
    const answer = parsed.answer.trim();
    const grounded =
      parsed.verified === true && answer !== ASK_FALLBACK && input.evidence.length > 0;
    return { answer, grounded };
  }

  async translate(input: TranslationInput): Promise<TranslationResult> {
    const target = input.targetLanguage === "te" ? "Telugu" : "English";
    const raw = await chatOllama(
      `You are a precise translator for Indian government documents. Translate into ${target}, preserving ALL dates, amounts, reference numbers, scheme names and document numbers EXACTLY as written — never paraphrase or convert them. Respond with ONLY JSON: {"translatedText": string}. No extra text.`,
      `Translate the following into ${target}:\n\n${input.text.slice(0, 6000)}`
    );
    const parsed = safeJsonParse<{ translatedText?: unknown }>(raw);
    if (parsed && typeof parsed.translatedText === "string" && parsed.translatedText.trim()) {
      return { translatedText: parsed.translatedText.trim() };
    }
    throw new Error("Translation returned an unexpected format.");
  }

  async generateActionPlan(input: ActionPlanInput): Promise<ActionPlan> {
    const out = await validatedCall(
      GROUND_RULES,
      buildActionPlanPrompt(input.extraction, input.evidence),
      (raw) => {
        const parsed = safeJsonParse<unknown>(raw);
        if (!parsed) return null;
        const res = actionPlanSchema.safeParse(parsed);
        return res.success ? res.data : null;
      },
      {},
      "GovLens/actionplan"
    );
    if (out) return { ...out, sourceIds: input.evidence.map((h) => h.documentId) };
    throw new Error("Action-plan generation returned an unexpected format.");
  }
}

function stripDataUrl(dataUrl: string): string {
  const idx = dataUrl.indexOf(",");
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

let singleton: AIEngine | null = null;

export function getAIEngine(): AIEngine {
  if (!singleton) singleton = new OllamaGemmaEngine();
  return singleton;
}

export async function checkOllamaHealth(): Promise<{
  status: "ok" | "degraded";
  ollama: boolean;
  modelAvailable: boolean;
  model: string;
}> {
  const model = ollamaModel();
  try {
    const res = await fetch(`${ollamaBaseUrl()}/api/tags`);
    if (!res.ok) return { status: "degraded", ollama: false, modelAvailable: false, model };
    const data = (await res.json()) as { models?: Array<{ name?: string; model?: string }> };
    const names = (data.models ?? []).map((m) => m.name ?? m.model ?? "");
    const modelAvailable = names.some((n) => n.startsWith(model.split(":")[0]));
    return { status: modelAvailable ? "ok" : "degraded", ollama: true, modelAvailable, model };
  } catch {
    return { status: "degraded", ollama: false, modelAvailable: false, model };
  }
}
