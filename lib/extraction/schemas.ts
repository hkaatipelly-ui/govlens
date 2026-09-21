/** Canonical document-extraction schema (server-only). Zod-validated. */
import { z } from "zod";

export const documentExtractionSchema = z.object({
  documentType: z.string().trim().min(1).max(200),
  title: z.string().trim().max(300).nullable().default(null),
  organization: z.string().trim().max(300).nullable().default(null),
  summary: z.string().trim().min(1).max(2000),
  /** Telugu translation of the summary (best-effort; may be absent). */
  summaryTelugu: z.string().trim().max(2000).optional(),
  deadline: z.string().trim().max(200).nullable().default(null),
  amount: z.string().trim().max(200).nullable().default(null),
  referenceNumber: z.string().trim().max(200).nullable().default(null),
  requiredDocuments: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  requiredActions: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  warningSignals: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  language: z.string().trim().max(16).default("en"),
  sourceIds: z.array(z.string().trim().min(1).max(128)).max(12).default([]),
});

export type DocumentExtraction = z.infer<typeof documentExtractionSchema>;

export const groundedAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(2000),
  verified: z.boolean(),
});

export type GroundedAnswerPayload = z.infer<typeof groundedAnswerSchema>;

/** Strip code fences and parse; returns null on malformed JSON (never throws). */
export function safeJsonParse<T>(raw: string): T | null {
  try {
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(stripped) as T;
  } catch {
    return null;
  }
}

/** Validate raw model JSON into a DocumentExtraction; null when invalid. */
export function validateExtractionJson(raw: string): DocumentExtraction | null {
  const parsed = safeJsonParse<unknown>(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const result = documentExtractionSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

/** Controlled fallback used ONLY when the model returns malformed JSON twice.
 *  Contains no invented facts: nullable slots stay null, lists stay empty. */
export function unverifiedExtractionFallback(language: string): DocumentExtraction {
  return {
    documentType: "Government document (unverified parse)",
    title: null,
    organization: null,
    summary:
      "The document text was read, but the local AI returned an unexpected format, so GovLens cannot summarize it reliably yet. Please retry analysis or ask a question below. I could not verify this from the official information available to GovLens.",
    deadline: null,
    amount: null,
    referenceNumber: null,
    requiredDocuments: [],
    requiredActions: [],
    warningSignals: ["Model output could not be validated — retry analysis before acting."],
    language,
    sourceIds: [],
  };
}
