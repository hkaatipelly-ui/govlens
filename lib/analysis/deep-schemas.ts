/** Deep-analysis schemas (server-only, Zod-validated). */
import { z } from "zod";

export const DIMENSIONS = [
  "WHO", "WHAT", "WHERE", "WHEN", "WHY", "WHICH", "WHOSE", "WHOM", "HOW",
  "HOW_MANY", "HOW_MUCH", "HOW_LONG", "HOW_FAR", "HOW_OFTEN", "HOW_OLD",
  "HOW_AUTHENTIC", "HOW_CERTAIN", "HOW_RELEVANT", "HOW_MATERIAL",
  "HOW_COMPLETE", "HOW_CONSISTENT", "HOW_SUPPORTED", "HOW_CONTRADICTED",
  "HOW_RECENT", "HOW_CONNECTED",
] as const;

export const questionSchema = z.object({
  questionId: z.string().trim().min(1).max(64),
  parentQuestionId: z.string().trim().max(64).nullable().default(null),
  dimension: z.enum(DIMENSIONS),
  question: z.string().trim().min(1).max(500),
  targetClaimId: z.string().trim().max(64).nullable().default(null),
  targetEntityIds: z.array(z.string().trim().max(64)).max(10).default([]),
  importance: z.enum(["informational", "relevant", "material", "critical"]).default("relevant"),
  questionStatus: z.enum(["unanswered", "answered", "unresolved"]).default("unanswered"),
  answer: z.string().trim().max(1000).default(""),
  evidenceIds: z.array(z.string().trim().max(64)).max(10).default([]),
  confidence: z.number().min(0).max(1).default(0),
  unresolvedReason: z.string().trim().max(500).default(""),
});

export type AnalysisQuestion = z.infer<typeof questionSchema>;

export const contradictionSchema = z.object({
  contradictionId: z.string().trim().min(1).max(64),
  category: z.enum([
    "name", "age", "address", "date", "amount", "survey_number",
    "property_extent", "case_number", "fir_number", "authority",
    "party_role", "timeline", "missing_reference", "duplicate_claim",
  ]),
  claimA: z.string().trim().max(500),
  claimB: z.string().trim().max(500),
  evidenceA: z.string().trim().max(500).default(""),
  evidenceB: z.string().trim().max(500).default(""),
  severity: z.enum(["informational", "relevant", "material", "critical"]).default("relevant"),
  explanation: z.string().trim().max(1000),
  verificationRequired: z.string().trim().max(500).default(""),
});

export type Contradiction = z.infer<typeof contradictionSchema>;

export const timelineEventSchema = z.object({
  date: z.string().trim().max(60),
  normalizedDate: z.string().trim().max(16).default(""),
  event: z.string().trim().min(1).max(500),
  actor: z.string().trim().max(300).default(""),
  source: z.enum(["document", "evidence"]).default("document"),
  page: z.number().int().min(1),
  confidence: z.number().min(0).max(1).default(0.5),
  flag: z.enum(["none", "gap", "impossible_order", "overlap", "inconsistent"]).default("none"),
});

export type TimelineEvent = z.infer<typeof timelineEventSchema>;

export const findingSchema = z.object({
  title: z.string().trim().min(1).max(300),
  detail: z.string().trim().max(1000),
  materiality: z.enum(["informational", "relevant", "material", "critical"]).default("relevant"),
  evidenceIds: z.array(z.string().trim().max(64)).max(10).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
});

export type Finding = z.infer<typeof findingSchema>;

export const deepReportSchema = z.object({
  executiveSummary: z.string().trim().max(1500).default(""),
  answers: z.array(
    z.object({
      questionId: z.string(),
      answer: z.string().max(1000),
      evidenceIds: z.array(z.string()).max(10).default([]),
      confidence: z.number().min(0).max(1).default(0.5),
    })
  ).max(40).default([]),
  findings: z.array(findingSchema).max(20).default([]),
  missingInformation: z.array(z.string().trim().max(300)).max(15).default([]),
  verificationRequirements: z.array(z.string().trim().max(300)).max(15).default([]),
  unresolvedQuestions: z.array(z.string().trim().max(300)).max(15).default([]),
});

export type DeepReport = z.infer<typeof deepReportSchema>;
