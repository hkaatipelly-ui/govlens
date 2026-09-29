/** External verification model (server-only, Zod-validated). */
import { z } from "zod";

export const VERIFICATION_RESULT_STATUSES = [
  "NOT_CHECKED",
  "CHECK_NOT_AVAILABLE",
  "UNVERIFIED",
  "MATCH",
  "PARTIAL_MATCH",
  "MISMATCH",
  "CONTRADICTED",
  "UNABLE_TO_VERIFY",
  "REQUIRES_HUMAN_REVIEW",
] as const;

export type VerificationResultStatus = (typeof VERIFICATION_RESULT_STATUSES)[number];

export const verificationResultSchema = z.object({
  resultId: z.string().trim().min(1).max(64),
  claimId: z.string().trim().max(64).default(""),
  sourceId: z.string().trim().max(128),
  field: z.string().trim().min(1).max(200),
  documentValue: z.string().trim().max(500),
  externalValue: z.string().trim().max(500).default(""),
  comparison: z.enum(["equal", "close", "different", "missing", "not_compared"]).default("not_compared"),
  status: z.enum(VERIFICATION_RESULT_STATUSES),
  explanation: z.string().trim().max(1000),
  retrievedAt: z.string().trim().max(64),
  sourceUrl: z.string().trim().max(500).nullable().default(null),
  sourceType: z.enum(["official_portal", "official_document", "user_provided", "knowledge_base"]),
  evidenceId: z.string().trim().max(64).default(""),
  humanReviewRequired: z.boolean().default(false),
});

export type VerificationResult = z.infer<typeof verificationResultSchema>;

export const lookupRequestSchema = z.object({
  adapterId: z.string().trim().min(1).max(64),
  authority: z.string().trim().max(300),
  sourceUrl: z.string().trim().max(500),
  fields: z.record(z.string().trim().max(200), z.string().trim().max(500)),
  instructions: z.string().trim().max(1000),
  automated: z.boolean().default(false),
});

export type LookupRequest = z.infer<typeof lookupRequestSchema>;

export const userEvidenceSchema = z.object({
  adapterId: z.string().trim().min(1).max(64),
  documentId: z.string().trim().min(1).max(128),
  claimId: z.string().trim().max(64).default(""),
  fields: z.record(z.string().trim().max(200), z.string().trim().max(500)),
  sourceUrl: z.string().trim().max(500).nullable().default(null),
});

export type UserEvidence = z.infer<typeof userEvidenceSchema>;
