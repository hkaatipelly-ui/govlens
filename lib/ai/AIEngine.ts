/** AIEngine interface — the ONLY contract the app uses for local AI. */
import type { DocumentExtraction } from "../extraction/schemas";
import type {
  ActionPlan,
  Explanation,
  OcrCleanup,
  Verification,
} from "../verification/schemas";
import type { KnowledgeHit } from "../knowledge/KnowledgeEngine";

export interface DocumentAnalysisInput {
  text: string;
  language: "en" | "te" | "hi";
  evidence: KnowledgeHit[];
}

export interface QuestionInput {
  question: string;
  documentText: string;
  language: "en" | "te" | "hi";
  evidence: KnowledgeHit[];
  /** Cached extraction summary keeps Q&A scoped without re-analysis. */
  extractionSummary?: string;
  /** Recent conversation turns for follow-up context (still document-scoped). */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface TranslationInput {
  text: string;
  targetLanguage: "en" | "te";
}

export interface CleanupInput {
  rawText: string;
}

export interface VerifyInput {
  ocrText: string;
  language?: string;
  /** Downscaled JPEG data URL (no data: prefix needed handling) for visual signals. */
  imageDataUrl?: string;
  retrievedSources?: KnowledgeHit[];
}

export interface ExtractInput {
  text: string;
  language: "en" | "te" | "hi";
  evidence: KnowledgeHit[];
  verification?: Verification | null;
}

export interface ExplainInput {
  text: string;
  extraction: DocumentExtraction;
  evidence: KnowledgeHit[];
  language: "en" | "te" | "hi";
}

export interface ActionPlanInput {
  extraction: DocumentExtraction;
  evidence: KnowledgeHit[];
}

export interface AnalysisResult {
  extraction: DocumentExtraction;
  /** True when official evidence supported the extraction. */
  grounded: boolean;
}

export interface AnswerResult {
  answer: string;
  grounded: boolean;
}

export interface TranslationResult {
  translatedText: string;
}

export interface AIEngine {
  analyzeDocument(input: DocumentAnalysisInput): Promise<AnalysisResult>;
  /** Stage A+B (+ retrieval merge by caller): is this a government document? */
  verifyGovernmentDocument(input: VerifyInput): Promise<Verification>;
  extractDocumentFields(input: ExtractInput): Promise<DocumentExtraction>;
  explainDocument(input: ExplainInput): Promise<Explanation>;
  answerQuestion(input: QuestionInput): Promise<AnswerResult>;
  translate(input: TranslationInput): Promise<TranslationResult>;
  generateActionPlan(input: ActionPlanInput): Promise<ActionPlan>;
  cleanupOcrText(input: CleanupInput): Promise<OcrCleanup>;
}

export class AIEngineUnavailableError extends Error {
  constructor(message = "Local AI (Ollama) is unavailable.") {
    super(message);
    this.name = "AIEngineUnavailableError";
  }
}

/** A single model call exceeded its server-side timeout (pipeline may degrade gracefully). */
export class AITimeoutError extends AIEngineUnavailableError {
  constructor(message = "Local AI timed out. The model may still be loading — please retry.") {
    super(message);
    this.name = "AITimeoutError";
  }
}
