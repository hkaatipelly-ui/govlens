/**
 * Deterministic analysis-foundation builders (no model calls).
 * Rule/keyword-based so they never invent facts; Gemma enrichment can layer
 * on later through the existing engine. Every output preserves page refs.
 */
import type { NormalizedDocument } from "../documents/normalized";
import type { Classification, Claim, Entity, Evidence } from "./schemas";
import { DOCUMENT_CATEGORIES } from "./schemas";

interface CategoryRule {
  category: (typeof DOCUMENT_CATEGORIES)[number];
  patterns: RegExp[];
  weight: number;
}

const RULES: CategoryRule[] = [
  { category: "fir", patterns: [/first information report|\bfir\b/i, /police station/i, /u\/s\.?\s*\d+.*ipc|section.*\d+.*cr\.?pc/i], weight: 3 },
  { category: "court_order", patterns: [/court order|order sheet|decree/i, /\bcourt\b.*(mam|district|sessions|high)/i], weight: 3 },
  { category: "court_document", patterns: [/\bcourt\b/i, /petitioner|respondent|appellant/i, /case no\.?\s/i], weight: 2 },
  { category: "sale_deed", patterns: [/sale deed/i, /vendor.*vendee|purchaser.*seller/i, /consideration.*rs/i], weight: 3 },
  { category: "land_property", patterns: [/survey\s*(no|number)/i, /khata|patta|passbook/i, /extent|acres?|guntas?/i, /dharani|mutation/i], weight: 3 },
  { category: "revenue_record", patterns: [/tahsildar|revenue (department|officer)/i, /pahani|adangal/i], weight: 2 },
  { category: "government_scheme", patterns: [/pm-kisan|scholarship|pension|subsidy|beneficiar/i, /eligibility/i], weight: 2 },
  { category: "government_order", patterns: [/government order|\bg\.?o\.?\b|memo|circular/i, /whereas|hereby ordered/i], weight: 2 },
  { category: "government_notice", patterns: [/notice|notification|public notice/i, /department|ministry|office of/i], weight: 2 },
  { category: "legal_notice", patterns: [/legal notice/i, /advocate.*enrolment|demand.*within \d+ days/i], weight: 2 },
  { category: "affidavit", patterns: [/\baffidavit\b/i, /solemnly affirm|deponent/i], weight: 3 },
  { category: "petition", patterns: [/\bpetition\b/i, /prayer|humble.*submit/i], weight: 2 },
  { category: "invoice", patterns: [/invoice|tax invoice|gstin/i, /total.*rs\.?|amount payable/i], weight: 2 },
  { category: "utility_bill", patterns: [/electricity|water bill|consumer (no|number)/i, /units consumed|due date/i], weight: 2 },
  { category: "identity_document", patterns: [/\baadhaar\b(?!.*appl)/i, /voter (id|epic)|passport|driving licen[sc]e/i], weight: 2 },
  { category: "tax_document", patterns: [/income tax|form 16|pan\s*:|assessment year/i], weight: 2 },
  { category: "medical_document", patterns: [/diagnosis|prescription|hospital|patient/i], weight: 2 },
  { category: "contract", patterns: [/\bcontract\b|\bagreement\b/i, /party.*first part|terms and conditions/i], weight: 2 },
  { category: "registration_document", patterns: [/sub-registrar|registration.*(deed|document)/i, /stamp duty/i], weight: 2 },
  { category: "encumbrance_related", patterns: [/encumbrance/i], weight: 3 },
  { category: "police_document", patterns: [/\bpolice\b/i, /station house officer|sho\b/i], weight: 2 },
];

const DATE_RE = /\b(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/g;
const MONEY_RE = /\bRs\.?\s?([\d,]+(?:\.\d{1,2})?)\b/gi;
const REF_RE = /\b([A-Z]{2,5}\d{4,12}[A-Z0-9-]*)\b/g;
const SURVEY_RE = /\bSurvey\s*(?:No\.?|Number)?\s*[:\-]?\s*(\d+[A-Z]?(?:\/[A-Z0-9]+)?)\b/gi;
const KHATA_RE = /\bKhata\s*(?:No\.?|Number)?\s*[:\-]?\s*([A-Z0-9/-]+)\b/gi;
const PHONE_RE = /\b(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CASE_RE = /\b(?:Case|FIR|Crime)\s*(?:No\.?|Number)?\s*[:\-]?\s*([A-Z0-9/-]+)\b/gi;
const SECTION_RE = /\b(?:Section|Sec\.?|U\/S)\s*(\d+[A-Z]?)\s*(IPC|Cr\.?PC|CPC|Evidence Act)?\b/gi;

export function classifyDocument(doc: NormalizedDocument): Classification {
  const text = doc.extractedText;
  let best: (typeof DOCUMENT_CATEGORIES)[number] = "unknown";
  let bestScore = 0;
  for (const rule of RULES) {
    let score = 0;
    for (const re of rule.patterns) {
      if (re.test(text)) score += rule.weight;
      re.lastIndex = 0;
    }
    if (score > bestScore) {
      bestScore = score;
      best = rule.category;
    }
  }
  const dates = [...new Set([...text.matchAll(DATE_RE)].map((m) => m[1]))].slice(0, 20);
  const docNum = firstGroup(text, [/\b([A-Z]{2,5}\d{4,12}[A-Z0-9-]*)\b/]);
  const caseNum = firstGroup(text, [/(?:Case|FIR|Crime)\s*(?:No\.?|Number)?\s*[:\-]?\s*([A-Z0-9/-]+)/i]);
  const authority = firstGroup(text, [
    /(Department of [A-Z][A-Za-z &]+)/,
    /((?:District|Sessions|High|Supreme) Court[^,\n]{0,40})/i,
    /([A-Z][A-Za-z ]* Police Station)/,
    /(Tahsildar[^,\n]{0,30})/i,
  ]);
  const total = RULES.reduce((n, r) => n + r.weight * r.patterns.length, 0);
  return {
    documentType: best,
    documentSubtype: "",
    issuingAuthority: authority,
    jurisdiction: firstGroup(text, [/\b(Telangana|Andhra Pradesh|Karnataka|Tamil Nadu|Maharashtra|Delhi)\b/i]),
    classificationConfidence: best === "unknown" ? 0.2 : Math.min(0.9, 0.35 + bestScore / Math.max(total, 1) * 8),
    detectedLanguage: /[\u0C00-\u0C7F]/.test(text) ? "te" : "en",
    detectedCaseNumber: caseNum,
    detectedDocumentNumber: docNum,
    detectedDates: dates,
    note: "Category consistency only — authenticity not independently verified; external verification required.",
  };
}

function firstGroup(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      re.lastIndex = 0;
      return (m[1] ?? m[0]).trim().slice(0, 200);
    }
    re.lastIndex = 0;
  }
  return null;
}

function push(
  out: Entity[],
  seen: Set<string>,
  entityType: Entity["entityType"],
  originalValue: string,
  pageNumber: number,
  textSpan: string,
  confidence: number
) {
  const key = `${entityType}:${originalValue.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({
    canonicalValue: originalValue.replace(/\s+/g, " ").trim(),
    originalValue: originalValue.trim(),
    entityType,
    pageNumber,
    textSpan: textSpan.slice(0, 500),
    confidence,
  });
}

export function extractEntities(doc: NormalizedDocument): Entity[] {
  const out: Entity[] = [];
  const seen = new Set<string>();
  for (const page of doc.pages) {
    const t = page.text;
    for (const m of t.matchAll(DATE_RE)) push(out, seen, "DATE", m[1], page.pageNumber, m[0], 0.9);
    for (const m of t.matchAll(MONEY_RE)) push(out, seen, "MONEY", `Rs ${m[1]}`, page.pageNumber, m[0], 0.9);
    for (const m of t.matchAll(SURVEY_RE)) push(out, seen, "SURVEY_NUMBER", m[1], page.pageNumber, m[0], 0.85);
    for (const m of t.matchAll(KHATA_RE)) push(out, seen, "KHATA_NUMBER", m[1], page.pageNumber, m[0], 0.85);
    for (const m of t.matchAll(PHONE_RE)) push(out, seen, "PHONE", m[0], page.pageNumber, m[0], 0.8);
    for (const m of t.matchAll(EMAIL_RE)) push(out, seen, "EMAIL", m[0], page.pageNumber, m[0], 0.9);
    for (const m of t.matchAll(CASE_RE)) {
      const kind = /fir/i.test(m[0]) ? "FIR" : "CASE";
      push(out, seen, kind, m[1], page.pageNumber, m[0], 0.8);
    }
    for (const m of t.matchAll(SECTION_RE))
      push(out, seen, "SECTION", `Section ${m[1]}${m[2] ? ` ${m[2]}` : ""}`, page.pageNumber, m[0], 0.8);
    for (const m of t.matchAll(REF_RE)) {
      if (/^\d+$/.test(m[1])) continue;
      push(out, seen, "REFERENCE_NUMBER", m[1], page.pageNumber, m[0], 0.7);
    }
    for (const m of t.matchAll(/((?:District|Sessions|High|Supreme) Court[^,\n]{0,40})/gi))
      push(out, seen, "COURT", m[1], page.pageNumber, m[0], 0.7);
    for (const m of t.matchAll(/([A-Z][A-Za-z ]* Police Station)/g))
      push(out, seen, "POLICE_STATION", m[1], page.pageNumber, m[0], 0.7);
    for (const m of t.matchAll(/(MeeSeva|Dharani|PM-KISAN|UIDAI|Aadhaar)/g))
      push(out, seen, "SCHEME", m[1], page.pageNumber, m[0], 0.9);
  }
  return out.slice(0, 200);
}

const MATERIAL_RE = /\b(deadline|due|expir|must|shall|required|mandatory|fee|rs\.?|penalt|notice|order|summon|hearing|comply)\b/i;

const ABBREV = /\b(?:No|Rs|Mr|Mrs|Ms|Dr|St|vs|Adv|Sr|Jr|Col|Gen|Dt|Ref|Art|Sec|Cl|Sch|Anx|Fig|Eq|Vol|Ch|Pt|Rs)\.$/;

function splitSentences(text: string): string[] {
  const out: string[] = [];
  const parts = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9(])/);
  let current = "";
  for (const part of parts) {
    current = current ? `${current} ${part}` : part;
    // Don't split after abbreviations like "No.", "Rs.", "Mr.".
    if (ABBREV.test(current) && part.length < 120) continue;
    if (current.length > 20) {
      out.push(current.trim());
      current = "";
    }
  }
  if (current.trim().length > 20) out.push(current.trim());
  return out.filter((s) => s.length <= 1000);
}

export function extractClaims(doc: NormalizedDocument, entities: Entity[]): Claim[] {
  const claims: Claim[] = [];
  let n = 0;
  for (const page of doc.pages) {
    for (const sentence of splitSentences(page.text)) {
      n += 1;
      if (n > 100) break;
      const refs = entities
        .filter((e) => e.pageNumber === page.pageNumber && sentence.includes(e.originalValue.slice(0, 20)))
        .slice(0, 6)
        .map((e, i) => `${doc.documentId}-ent-${i}`);
      claims.push({
        claimId: `${doc.documentId}-claim-${n}`,
        subject: "",
        predicate: "",
        object: "",
        claimText: sentence,
        sourcePage: page.pageNumber,
        sourceText: sentence.slice(0, 1000),
        confidence: 0.6,
        materiality: MATERIAL_RE.test(sentence) ? "high" : "medium",
        verificationStatus: "extracted",
        evidenceIds: refs,
      });
    }
  }
  return claims;
}

export function buildEvidence(
  doc: NormalizedDocument,
  claims: Claim[],
  retrievalHits: Array<{ documentId: string; title: string; state: string; sourceUrl: string; content: string }>
): Evidence[] {
  const now = new Date().toISOString();
  const out: Evidence[] = claims.slice(0, 100).map((c, i) => ({
    evidenceId: `${doc.documentId}-ev-${i + 1}`,
    sourceType: "document_text" as const,
    sourceName: doc.fileName ?? doc.sourceType,
    documentId: doc.documentId,
    page: c.sourcePage,
    text: c.sourceText.slice(0, 2000),
    url: null,
    retrievedAt: now,
    verificationStatus: "extracted" as const,
  }));
  retrievalHits.slice(0, 6).forEach((h, i) => {
    out.push({
      evidenceId: `${doc.documentId}-ev-src-${i + 1}`,
      sourceType: "official_document",
      sourceName: h.title,
      documentId: doc.documentId,
      page: null,
      text: h.content.slice(0, 2000),
      url: h.sourceUrl || null,
      retrievedAt: now,
      verificationStatus: "supported",
    });
  });
  return out;
}
