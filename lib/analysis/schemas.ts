/** Analysis foundation schemas (server-only, Zod-validated). */
import { z } from "zod";

export const DOCUMENT_CATEGORIES = [
  "government_scheme",
  "government_notice",
  "government_order",
  "land_property",
  "sale_deed",
  "registration_document",
  "revenue_record",
  "encumbrance_related",
  "court_document",
  "court_order",
  "petition",
  "affidavit",
  "fir",
  "police_document",
  "legal_notice",
  "contract",
  "agreement",
  "invoice",
  "utility_bill",
  "identity_document",
  "medical_document",
  "tax_document",
  "other_official",
  "unknown",
] as const;

export const classificationSchema = z.object({
  documentType: z.enum(DOCUMENT_CATEGORIES),
  documentSubtype: z.string().trim().max(200).default(""),
  issuingAuthority: z.string().trim().max(300).nullable().default(null),
  jurisdiction: z.string().trim().max(200).nullable().default(null),
  classificationConfidence: z.number().min(0).max(1),
  detectedLanguage: z.string().trim().max(16).default("en"),
  detectedCaseNumber: z.string().trim().max(200).nullable().default(null),
  detectedDocumentNumber: z.string().trim().max(200).nullable().default(null),
  detectedDates: z.array(z.string().trim().max(60)).max(20).default([]),
  note: z.string().trim().max(500).default(
    "Category consistency only — authenticity not independently verified; external verification required."
  ),
});

export type Classification = z.infer<typeof classificationSchema>;

export const ENTITY_TYPES = [
  "PERSON",
  "ORGANIZATION",
  "AUTHORITY",
  "COURT",
  "POLICE_STATION",
  "CASE",
  "FIR",
  "PROPERTY",
  "SURVEY_NUMBER",
  "KHATA_NUMBER",
  "DOCUMENT",
  "TRANSACTION",
  "DATE",
  "TIME",
  "LOCATION",
  "MONEY",
  "AMOUNT",
  "ADDRESS",
  "PHONE",
  "EMAIL",
  "ACCOUNT",
  "SCHEME",
  "LAW",
  "ACT",
  "SECTION",
  "ORDER",
  "REFERENCE_NUMBER",
] as const;

export const entitySchema = z.object({
  canonicalValue: z.string().trim().min(1).max(300),
  originalValue: z.string().trim().min(1).max(300),
  entityType: z.enum(ENTITY_TYPES),
  pageNumber: z.number().int().min(1),
  textSpan: z.string().trim().max(500),
  confidence: z.number().min(0).max(1),
});

export type Entity = z.infer<typeof entitySchema>;

export const CLAIM_STATUSES = [
  "extracted",
  "supported",
  "externally_verified",
  "contradicted",
  "unresolved",
] as const;

export const claimSchema = z.object({
  claimId: z.string().trim().min(1).max(64),
  subject: z.string().trim().max(300).default(""),
  predicate: z.string().trim().max(300).default(""),
  object: z.string().trim().max(500).default(""),
  claimText: z.string().trim().min(1).max(1000),
  sourcePage: z.number().int().min(1),
  sourceText: z.string().trim().max(1000),
  confidence: z.number().min(0).max(1),
  materiality: z.enum(["high", "medium", "low"]).default("medium"),
  verificationStatus: z.enum(CLAIM_STATUSES).default("extracted"),
  evidenceIds: z.array(z.string().trim().min(1).max(64)).max(20).default([]),
});

export type Claim = z.infer<typeof claimSchema>;

export const EVIDENCE_TYPES = [
  "document_text",
  "document_image",
  "table",
  "signature_reference",
  "extracted_entity",
  "extracted_claim",
  "official_portal_result",
  "official_document",
  "case_record",
  "user_provided_information",
] as const;

export const evidenceSchema = z.object({
  evidenceId: z.string().trim().min(1).max(64),
  sourceType: z.enum(EVIDENCE_TYPES),
  sourceName: z.string().trim().max(300),
  documentId: z.string().trim().max(128),
  page: z.number().int().min(1).nullable().default(null),
  text: z.string().trim().max(2000),
  url: z.string().trim().max(500).nullable().default(null),
  retrievedAt: z.string().trim().max(64),
  verificationStatus: z.enum(CLAIM_STATUSES).default("extracted"),
});

export type Evidence = z.infer<typeof evidenceSchema>;
