/** Scheme analysis schemas (server-only, Zod-validated). */
import { z } from "zod";

export const REQUIREMENT_STATUSES = [
  "SATISFIED",
  "NOT_SATISFIED",
  "UNKNOWN",
  "INSUFFICIENT_EVIDENCE",
  "NOT_APPLICABLE",
] as const;

export const requirementSchema = z.object({
  requirementId: z.string().trim().min(1).max(64),
  requirement: z.string().trim().min(1).max(300),
  extractedRule: z.string().trim().max(500).default(""),
  userEvidence: z.string().trim().max(500).default(""),
  status: z.enum(REQUIREMENT_STATUSES).default("UNKNOWN"),
  evidenceIds: z.array(z.string().trim().max(64)).max(10).default([]),
  missingEvidence: z.string().trim().max(500).default(""),
  explanation: z.string().trim().max(500).default(""),
});

export type Requirement = z.infer<typeof requirementSchema>;

export const schemeExtractionSchema = z.object({
  schemeName: z.string().trim().max(300).nullable().default(null),
  issuingAuthority: z.string().trim().max(300).nullable().default(null),
  objective: z.string().trim().max(1000).default(""),
  targetBeneficiaries: z.string().trim().max(500).default(""),
  eligibilityRules: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  exclusions: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  ageRequirements: z.string().trim().max(300).default(""),
  incomeRequirements: z.string().trim().max(300).default(""),
  residenceRequirements: z.string().trim().max(300).default(""),
  occupationRequirements: z.string().trim().max(300).default(""),
  categoryRequirements: z.string().trim().max(300).default(""),
  propertyRequirements: z.string().trim().max(300).default(""),
  deadline: z.string().trim().max(200).nullable().default(null),
  benefit: z.string().trim().max(300).default(""),
  amount: z.string().trim().max(200).nullable().default(null),
  applicationMethod: z.string().trim().max(500).default(""),
  requiredDocuments: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  requiredActions: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  officialSources: z.array(z.string().trim().min(1).max(128)).max(12).default([]),
});

export type SchemeExtraction = z.infer<typeof schemeExtractionSchema>;

export const schemeDocSchema = z.object({
  documentName: z.string().trim().min(1).max(300),
  whyRequired: z.string().trim().max(500).default(""),
  issuer: z.string().trim().max(300).default(""),
  acceptableEvidence: z.string().trim().max(500).default(""),
  validityRecency: z.string().trim().max(300).default(""),
  state: z.enum(["missing", "provided", "incomplete", "unknown"]).default("unknown"),
  source: z.string().trim().max(300).default(""),
});

export type SchemeDocument = z.infer<typeof schemeDocSchema>;

export const schemeQuestionSchema = z.object({
  questionId: z.string().trim().min(1).max(64),
  requirementId: z.string().trim().max(64).default(""),
  question: z.string().trim().min(1).max(500),
  questionStatus: z.enum(["unanswered", "answered", "unresolved"]).default("unanswered"),
  answer: z.string().trim().max(1000).default(""),
});

export type SchemeQuestion = z.infer<typeof schemeQuestionSchema>;
