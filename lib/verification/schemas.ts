/** Verification / cleanup / explanation / action-plan schemas (server-only). */
import { z } from "zod";

export const VERIFICATION_STATUSES = [
  "verified",
  "likely_government",
  "uncertain",
  "not_government",
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const ocrCleanupSchema = z.object({
  cleanedText: z.string().trim(),
  language: z.string().trim().max(16).default("en"),
  confidence: z.number().min(0).max(1).default(0.5),
  warnings: z.array(z.string().trim().max(300)).max(10).default([]),
});

export type OcrCleanup = z.infer<typeof ocrCleanupSchema>;

export const verificationSchema = z.object({
  status: z.enum(VERIFICATION_STATUSES),
  confidence: z.number().min(0).max(1),
  documentType: z.string().trim().max(200).default("Unknown"),
  organization: z.string().trim().max(300).nullable().default(null),
  reasons: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  matchedSources: z.array(z.string().trim().min(1).max(128)).max(12).default([]),
  verificationWarnings: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  visualSignals: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
});

export type Verification = z.infer<typeof verificationSchema>;

export const explanationSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  importantPoints: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  whatToDo: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  deadline: z.string().trim().max(200).default(""),
  amount: z.string().trim().max(200).default(""),
  verificationNote: z.string().trim().max(500).default(""),
  sourceIds: z.array(z.string().trim().min(1).max(128)).max(12).default([]),
});

export type Explanation = z.infer<typeof explanationSchema>;

export const actionPlanSchema = z.object({
  actions: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(300),
        detail: z.string().trim().max(500).default(""),
      })
    )
    .max(10)
    .default([]),
  reminders: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  deadline: z.string().trim().max(200).nullable().default(null),
  sourceIds: z.array(z.string().trim().min(1).max(128)).max(12).default([]),
});

export type ActionPlan = z.infer<typeof actionPlanSchema>;

/** Uncertain-by-default verification — used when the model fails twice. */
export function uncertainVerificationFallback(): Verification {
  return {
    status: "uncertain",
    confidence: 0.3,
    documentType: "Unknown",
    organization: null,
    reasons: ["The local AI could not classify this document reliably."],
    matchedSources: [],
    verificationWarnings: [
      "GovLens could not verify this document — review it carefully before acting.",
    ],
    visualSignals: [],
  };
}
