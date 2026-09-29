/** Legal intelligence schemas (server-only, Zod-validated). */
import { z } from "zod";

export const LEGAL_CATEGORIES = new Set([
  "court_document",
  "court_order",
  "petition",
  "affidavit",
  "fir",
  "police_document",
  "legal_notice",
  "contract",
  "agreement",
  "sale_deed",
]);

export const legalHeaderSchema = z.object({
  court: z.string().trim().max(300).nullable().default(null),
  jurisdiction: z.string().trim().max(300).nullable().default(null),
  caseNumber: z.string().trim().max(200).nullable().default(null),
  cnr: z.string().trim().max(100).nullable().default(null),
  firNumber: z.string().trim().max(200).nullable().default(null),
  policeStation: z.string().trim().max(300).nullable().default(null),
  filingNumber: z.string().trim().max(200).nullable().default(null),
  caseType: z.string().trim().max(200).nullable().default(null),
  registrationYear: z.string().trim().max(10).nullable().default(null),
  parties: z.array(z.string().trim().max(200)).max(20).default([]),
  advocates: z.array(z.string().trim().max(200)).max(20).default([]),
  dates: z.array(z.string().trim().max(60)).max(20).default([]),
  statutes: z.array(z.string().trim().max(300)).max(20).default([]),
  sections: z.array(z.string().trim().max(100)).max(20).default([]),
  orders: z.array(z.string().trim().max(500)).max(20).default([]),
});

export type LegalHeader = z.infer<typeof legalHeaderSchema>;

export const PARTY_ROLES = [
  "petitioner", "respondent", "plaintiff", "defendant", "complainant",
  "accused", "appellant", "witness", "advocate", "authority", "other",
] as const;

export const partySchema = z.object({
  partyId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  role: z.enum(PARTY_ROLES),
  roleEvidence: z.string().trim().max(500).default(""),
  claims: z.array(z.string().trim().max(64)).max(20).default([]),
  actions: z.array(z.string().trim().max(300)).max(20).default([]),
  documents: z.array(z.string().trim().max(128)).max(20).default([]),
  dates: z.array(z.string().trim().max(60)).max(20).default([]),
  relationships: z.array(z.string().trim().max(300)).max(20).default([]),
  evidence: z.array(z.string().trim().max(64)).max(20).default([]),
});

export type Party = z.infer<typeof partySchema>;

export const matrixEntrySchema = z.object({
  claimId: z.string().trim().max(64),
  claimText: z.string().trim().max(1000),
  supporting: z.array(z.string().trim().max(500)).max(10).default([]),
  contradicting: z.array(z.string().trim().max(500)).max(10).default([]),
  missing: z.array(z.string().trim().max(500)).max(10).default([]),
  sourcePage: z.number().int().min(1),
  status: z.enum(["supported", "contradicted", "unresolved", "requires_human_review"]).default("unresolved"),
});

export type MatrixEntry = z.infer<typeof matrixEntrySchema>;

export const provisionSchema = z.object({
  reference: z.string().trim().min(1).max(300),
  kind: z.enum(["act", "rule", "section", "order", "notification", "judgment", "citation", "other"]),
  pageNumber: z.number().int().min(1),
});

export type Provision = z.infer<typeof provisionSchema>;

export const relationshipSchema = z.object({
  fromDocumentId: z.string().trim().max(128),
  toReference: z.string().trim().max(300),
  relation: z.enum(["references", "contradicts", "supports", "amends", "encloses"]),
  evidence: z.string().trim().max(500).default(""),
});

export type DocRelationship = z.infer<typeof relationshipSchema>;
