/** DocumentIntelligenceReport schema (server-only, Zod-validated). */
import { z } from "zod";

const groundedRef = z.object({
  page: z.number().int().min(1).nullable().default(null),
  text: z.string().trim().max(500).default(""),
  sourceId: z.string().trim().max(128).default(""),
});

const qaItem = z.object({
  dimension: z.string().trim().max(32),
  question: z.string().trim().max(500),
  answer: z.string().trim().max(1000),
  evidence: z.array(groundedRef).max(5).default([]),
  confidence: z.number().min(0).max(1).default(0),
  status: z.enum(["answered", "unanswered", "unresolved"]).default("unanswered"),
});

const verificationRow = z.object({
  claim: z.string().trim().max(500),
  documentValue: z.string().trim().max(300),
  externalValue: z.string().trim().max(300).default(""),
  source: z.string().trim().max(300),
  result: z.string(),
  retrievedAt: z.string().trim().max(64).default(""),
});

const contradictionRow = z.object({
  finding: z.string().trim().max(500),
  evidenceA: z.string().trim().max(500).default(""),
  evidenceB: z.string().trim().max(500).default(""),
  whyInconsistent: z.string().trim().max(500),
  whatToCheck: z.string().trim().max(500).default(""),
});

const actionItem = z.object({
  action: z.string().trim().min(1).max(300),
  reason: z.string().trim().max(500).default(""),
  deadline: z.string().trim().max(200).default(""),
  prerequisite: z.string().trim().max(300).default(""),
  source: z.string().trim().max(300).default(""),
  status: z.enum(["pending", "done"]).default("pending"),
});

export const documentIntelligenceReportSchema = z.object({
  documentIdentity: z.object({
    documentId: z.string(),
    fileName: z.string().nullable().default(null),
    sourceType: z.string().default("text"),
    pageCount: z.number().int().min(1).default(1),
    language: z.string().default("en"),
  }),
  executiveSummary: z.string().trim().min(1).max(1500),
  documentType: z.string().trim().max(200),
  entities: z.array(
    z.object({
      type: z.string(), value: z.string(), page: z.number().int().min(1),
    })
  ).max(60).default([]),
  claims: z.array(
    z.object({
      text: z.string(), page: z.number().int().min(1), status: z.string(),
    })
  ).max(100).default([]),
  nineWAnalysis: z.array(qaItem).max(40).default([]),
  howAnalysis: z.array(qaItem).max(30).default([]),
  questionTree: z.array(
    z.object({
      questionId: z.string(), parentQuestionId: z.string().nullable().default(null),
      dimension: z.string(), question: z.string(), answer: z.string().default(""),
      status: z.string().default("unanswered"),
    })
  ).max(80).default([]),
  evidence: z.array(
    z.object({
      sourceType: z.string(), sourceName: z.string(), page: z.number().int().min(1).nullable().default(null),
      text: z.string(), url: z.string().nullable().default(null),
    })
  ).max(60).default([]),
  verification: z.array(verificationRow).max(40).default([]),
  timeline: z.array(
    z.object({
      date: z.string(), event: z.string(), actor: z.string().default(""),
      page: z.number().int().min(1), flag: z.string().default("none"),
    })
  ).max(60).default([]),
  contradictions: z.array(contradictionRow).max(20).default([]),
  eligibility: z.array(
    z.object({
      requirement: z.string(), status: z.string(), explanation: z.string().default(""),
    })
  ).max(30).default([]),
  checklist: z.array(
    z.object({ documentName: z.string(), state: z.string(), whyRequired: z.string().default("") })
  ).max(30).default([]),
  requiredActions: z.array(actionItem).max(30).default([]),
  missingInformation: z.array(z.string().trim().max(300)).max(20).default([]),
  unresolvedQuestions: z.array(z.string().trim().max(300)).max(20).default([]),
  humanReviewItems: z.array(z.string().trim().max(500)).max(20).default([]),
  sources: z.array(
    z.object({ id: z.string(), title: z.string(), department: z.string().default("") })
  ).max(20).default([]),
});

export type DocumentIntelligenceReport = z.infer<typeof documentIntelligenceReportSchema>;
