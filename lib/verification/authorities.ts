/**
 * Authority adapters. Each declares: what it can verify, the official portal
 * link, and the exact lookup fields for USER-ASSISTED verification.
 * No invented endpoints, no scraping, no CAPTCHA/auth bypass — automated
 * lookups are unsupported until an official machine API is confirmed.
 */
import type { Claim } from "../analysis/schemas";
import type { LookupRequest, VerificationResult } from "./external-schemas";
import {
  compareField,
  registerAdapter,
  type NormalizedExternalRecord,
  type VerificationSourceAdapter,
} from "./adapters";

function claimHas(claim: Claim, re: RegExp): boolean {
  return re.test(`${claim.claimText} ${claim.subject} ${claim.object}`);
}

function baseLookup(
  adapter: Pick<VerificationSourceAdapter, "adapterId" | "authority" | "sourceUrl">,
  claim: Claim,
  documentId: string,
  fields: Record<string, string>,
  instructions: string
): LookupRequest {
  return {
    adapterId: adapter.adapterId,
    authority: adapter.authority,
    sourceUrl: adapter.sourceUrl,
    fields,
    instructions,
    automated: false,
  };
}

function compareAll(
  claim: Claim,
  record: NormalizedExternalRecord,
  wanted: string[]
): VerificationResult[] {
  return wanted
    .filter((f) => record.fields[f] !== undefined || claimMatchesField(claim, f))
    .map((f, i) =>
      compareField(
        f,
        extractClaimField(claim, f),
        record.fields[f] ?? "",
        {
          resultId: `${record.adapterId}-${Date.now()}-${i}`,
          sourceId: record.adapterId,
          evidenceId: claim.evidenceIds[0] ?? "",
          claimId: claim.claimId,
        },
        { sourceUrl: record.sourceUrl, sourceType: record.origin === "user_provided" ? "user_provided" : "official_document" }
      )
    );
}

function claimMatchesField(claim: Claim, field: string): boolean {
  const t = `${claim.claimText}`.toLowerCase();
  const hints: Record<string, RegExp> = {
    holder: /holder|owner|pattadar|applicant|vendor|buyer|purchaser/i,
    survey_number: /survey/i,
    extent: /extent|acre|gunta|hectare/i,
    khata: /khata/i,
    district: /district/i,
    mandal: /mandal|taluk|tehsil/i,
    village: /village/i,
    classification: /classificat|dry|wet|irrigated/i,
    case_number: /case|fir|crime/i,
    parties: /petitioner|respondent|complainant|accused|appellant/i,
    date: /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/,
    amount: /rs\.?|fee|amount|consideration/i,
  };
  return hints[field]?.test(t) ?? true;
}

function extractClaimField(claim: Claim, field: string): string {
  const t = claim.claimText;
  // Person-name capture must be case-SENSITIVE ([A-Z] with /i would eat
  // lowercase words), so locate the keyword first, then capture names.
  const nameAfter = (keywords: RegExp): string | null => {
    const kw = t.match(keywords);
    if (!kw || kw.index === undefined) return null;
    const tail = t.slice(kw.index + kw[0].length).replace(/^(is\s+)?/i, "");
    const m = tail.match(/^([A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*){0,4})/);
    return m ? m[1].trim() : null;
  };
  const patterns: Record<string, RegExp> = {
    parties: /((?:petitioner|respondent|complainant|accused|vendor|buyer)[^.\n]{0,80})/i,
    scheme: /((?:PM-KISAN|PM Kisan|scholarship|pension|subsidy)[^.\n]{0,60})/i,
    eligibility: /(eligib[^.\n]{0,120})/i,
    document_number: /\b([A-Z]{2,5}\d{4,12}[A-Z0-9-]*)\b/,
    registration_office: /((?:Sub-)?Registrar[^,\n]{0,40})/i,
    transaction_date: /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/,
    consideration: /(Rs\.?\s?[\d,]+(?:\.\d{1,2})?)/i,
    cnr: /\bCNR\s*(?:No\.?|Number)?\s*[:\-]?\s*([A-Z0-9]+)\b/i,
    court: /((?:District|Sessions|High|Supreme) Court[^,\n]{0,40})/i,
    filing_number: /filing\s*(?:No\.?|Number)?\s*[:\-]?\s*([A-Z0-9/-]+)/i,
    party_name: /((?:petitioner|respondent|complainant)[^.\n]{0,80})/i,
    year: /\b((?:19|20)\d{2})\b/,
    applicant_detail: /applicant[^.\n]{0,120}/i,
    survey_number: /Survey\s*(?:No\.?|Number)?\s*[:\-]?\s*(\d+[A-Z]?(?:\/[A-Z0-9]+)?)/i,
    khata: /Khata\s*(?:No\.?|Number)?\s*[:\-]?\s*([A-Z0-9/-]+)/i,
    district: /([A-Z][A-Za-z]+)\s+district/i,
    mandal: /([A-Z][A-Za-z ]+?)\s+(?:mandal|taluk|tehsil)/i,
    village: /(?:village|Village)\s*[:\-]?\s*([A-Z][A-Za-z ]+)/,
    extent: /((?:\d+(?:\.\d+)?)\s*(?:acres?|guntas?|hectares?))/i,
    case_number: /(?:Case|FIR|Crime)\s*(?:No\.?|Number)?\s*[:\-]?\s*([A-Z0-9/-]+)/i,
    date: /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/,
    amount: /(Rs\.?\s?[\d,]+(?:\.\d{1,2})?)/i,
  };
  if (field === "holder") {
    const name = nameAfter(/(?:holder|owner|pattadar|applicant|vendor|buyer|purchaser|complainant|accused)\s+/i);
    if (name) return name.slice(0, 200);
  }
  const m = t.match(patterns[field] ?? /(.*)/);
  return ((m?.[1] ?? t).trim().slice(0, 200) || t.slice(0, 200));
}

const LAND_FIELDS = ["district", "mandal", "village", "survey_number", "khata", "holder", "extent", "classification"];

export const TelanganaLandRecordsAdapter: VerificationSourceAdapter = {
  adapterId: "tg-land-bhubharati",
  authority: "Revenue Department, Government of Telangana (Bhu Bharati portal)",
  sourceUrl: "https://bhubharati.telangana.gov.in",
  canVerify: (claim) => claimHas(claim, /survey|khata|patta|passbook|extent|acre|gunta|holder|mutation|dharani|land/i),
  buildLookupRequest: (claim, documentId) =>
    baseLookup(TelanganaLandRecordsAdapter, claim, documentId, {
      district: "", mandal: "", village: "", survey_number: "", khata: "",
      holder: "", extent: "", classification: "",
    }, "Open the Bhu Bharati portal, enter district → mandal → village → survey number, and copy the holder name, extent and classification exactly as shown."),
  compare: (claim, record, ids) =>
    compareAll(claim, record, LAND_FIELDS).map((r, i) => ({ ...r, resultId: `${ids.resultId}-${i}`, sourceId: ids.sourceId, evidenceId: ids.evidenceId })),
};

export const TelanganaRegistrationAdapter: VerificationSourceAdapter = {
  adapterId: "tg-registration",
  authority: "Registration & Stamps Department, Government of Telangana",
  sourceUrl: "https://registration.telangana.gov.in",
  canVerify: (claim) => claimHas(claim, /regist|sub-registrar|stamp duty|deed|consideration|vendor|vendee/i),
  buildLookupRequest: (claim, documentId) =>
    baseLookup(TelanganaRegistrationAdapter, claim, documentId, {
      document_number: "", registration_year: "", registration_office: "",
      parties: "", transaction_date: "", consideration: "",
    }, "Use the Registration Department encumbrance/registered-document search with the document number, year and office; copy the listed fields exactly."),
  compare: (claim, record, ids) =>
    compareAll(claim, record, ["document_number", "registration_office", "parties", "transaction_date", "consideration"]).map((r, i) => ({ ...r, resultId: `${ids.resultId}-${i}`, sourceId: ids.sourceId, evidenceId: ids.evidenceId })),
};

export const IndiaECourtsAdapter: VerificationSourceAdapter = {
  adapterId: "in-ecourts",
  authority: "eCourts Mission Mode Project, Department of Justice, Government of India",
  sourceUrl: "https://services.ecourts.gov.in",
  canVerify: (claim) => claimHas(claim, /\bcnr\b|case no|filing number|ecourts|court|fir|petitioner|respondent|advocate/i),
  buildLookupRequest: (claim, documentId) =>
    baseLookup(IndiaECourtsAdapter, claim, documentId, {
      cnr: "", case_number: "", filing_number: "", party_name: "", court: "", year: "",
    }, "Use the eCourts services portal (CNR / case number / party name search) and copy the case status fields exactly as shown."),
  compare: (claim, record, ids) =>
    compareAll(claim, record, ["cnr", "case_number", "parties", "court", "date"]).map((r, i) => ({ ...r, resultId: `${ids.resultId}-${i}`, sourceId: ids.sourceId, evidenceId: ids.evidenceId })),
};

export const GovernmentSchemeAdapter: VerificationSourceAdapter = {
  adapterId: "govt-scheme",
  authority: "Concerned scheme department (see matched official source)",
  sourceUrl: "https://www.myscheme.gov.in",
  canVerify: (claim) => claimHas(claim, /eligib|scheme|beneficiar|scholarship|pension|subsidy|income|age|residence/i),
  buildLookupRequest: (claim, documentId) =>
    baseLookup(GovernmentSchemeAdapter, claim, documentId, {
      scheme: "", eligibility: "", applicant_detail: "",
    }, "Open the scheme's official page/portal, check the published eligibility criteria, and paste the exact criterion text."),
  compare: (claim, record, ids) =>
    compareAll(claim, record, ["scheme", "eligibility"]).map((r, i) => ({ ...r, resultId: `${ids.resultId}-${i}`, sourceId: ids.sourceId, evidenceId: ids.evidenceId })),
};

export function registerBuiltInAdapters(): void {
  registerAdapter(TelanganaLandRecordsAdapter);
  registerAdapter(TelanganaRegistrationAdapter);
  registerAdapter(IndiaECourtsAdapter);
  registerAdapter(GovernmentSchemeAdapter);
}
