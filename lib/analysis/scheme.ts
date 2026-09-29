/**
 * Scheme Analysis Engine (deterministic, evidence-grounded, no model calls).
 * Activated when classification is scheme-like. Every rule/checklist item
 * comes from official evidence text or the extraction — never invented.
 * UNKNOWN is never converted to NOT_SATISFIED. Language is always
 * "Based on the available evidence...", never a final determination.
 */
import type { DocumentExtraction } from "../extraction/schemas";
import type { KnowledgeHit } from "../knowledge/KnowledgeEngine";
import type {
  Requirement,
  SchemeDocument,
  SchemeExtraction,
  SchemeQuestion,
} from "./scheme-schemas";

export const SCHEME_CATEGORIES = new Set([
  "government_scheme",
  "government_notice",
  "government_order",
  "other_official",
]);

export function isSchemeLike(classification: string, text: string): boolean {
  if (SCHEME_CATEGORIES.has(classification)) return true;
  return /scheme|scholarship|pension|subsidy|benefit|eligib|pm-kisan|welfare|yojana/i.test(text);
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);
}

function findSentences(hay: string[], re: RegExp, max = 6): string[] {
  const out: string[] = [];
  for (const s of hay) {
    if (re.test(s)) {
      out.push(s.slice(0, 500));
      if (out.length >= max) break;
    }
    re.lastIndex = 0;
  }
  return out;
}

const SCHEME_NAMES = [
  "PM-KISAN",
  "PM Kisan Samman Nidhi",
  "Rythu Bandhu",
  "Rythu Bima",
  "Aasara",
  "Kalyana Lakshmi",
  "Shaadi Mubarak",
  "Fee Reimbursement",
  "Post-Matric Scholarship",
  "Pre-Matric Scholarship",
  "Old Age Pension",
  "Widow Pension",
  "Disability Pension",
];

export function extractScheme(
  documentText: string,
  extraction: DocumentExtraction,
  evidence: KnowledgeHit[]
): SchemeExtraction {
  const evText = evidence.map((h) => h.content).join("\n");
  const combined = `${documentText}\n${evText}`;
  const sents = sentences(combined);

  const schemeName =
    SCHEME_NAMES.find((n) => new RegExp(n.replace(/[-\s]/g, "[-\\s]?"), "i").test(combined)) ?? null;
  const authority =
    extraction.organization ??
    findSentences(sents, /Department of [A-Z][A-Za-z &]+|Ministry of [A-Z][A-Za-z &]+/)[0]?.match(
      /(Department of [A-Z][A-Za-z &]+|Ministry of [A-Z][A-Za-z &]+)/
    )?.[1] ??
    null;

  const eligibilityRules = [
    ...findSentences(sents, /eligib[^.]{0,200}/i, 8),
    ...findSentences(sents, /requires? [^.]{0,150}|must (have|be|hold)[^.]{0,150}/i, 6),
  ].slice(0, 20);
  const exclusions = findSentences(
    sents,
    /exclus|not eligible|except|does not (apply|cover)|ineligible/i,
    10
  );
  const pick = (re: RegExp): string =>
    findSentences(sents, re, 2).join(" ").slice(0, 300);

  return {
    schemeName,
    issuingAuthority: authority,
    objective: findSentences(sents, /objective|aims? to|purpose|provides? .*support/i, 2).join(" ").slice(0, 1000),
    targetBeneficiaries: findSentences(sents, /beneficiar|farmers?|students?|women|senior citizens|families/i, 2).join(" ").slice(0, 500),
    eligibilityRules,
    exclusions,
    ageRequirements: pick(/age[^.]{0,120}/i),
    incomeRequirements: pick(/income[^.]{0,120}/i),
    residenceRequirements: pick(/residen|domicile|native of[^.]{0,120}/i),
    occupationRequirements: pick(/occupation|employ|farmer|student|profession[^.]{0,120}/i),
    categoryRequirements: pick(/categor|SC\/ST|OBC|minority|BPL[^.]{0,120}/i),
    propertyRequirements: pick(/(land|cultivable|holding)[^.]{0,120}/i),
    deadline: extraction.deadline,
    benefit: findSentences(sents, /benefit|assistance of|support of[^.]{0,150}/i, 2).join(" ").slice(0, 300),
    amount: extraction.amount,
    applicationMethod: findSentences(sents, /apply|application.*(portal|online|centre|office)|register[^.]{0,150}/i, 3).join(" ").slice(0, 500),
    requiredDocuments: [...new Set(extraction.requiredDocuments)].slice(0, 20),
    requiredActions: [...new Set(extraction.requiredActions)].slice(0, 20),
    officialSources: evidence.map((h) => h.documentId),
  };
}

const RULE_LABELS: Array<[RegExp, string]> = [
  [/age[^.]{0,80}/i, "Age criterion"],
  [/income[^.]{0,80}/i, "Income criterion"],
  [/residen|domicile/i, "Residence criterion"],
  [/occupation|employ|farmer|student/i, "Occupation criterion"],
  [/categor|SC\/ST|OBC|minority|BPL/i, "Category criterion"],
  [/(land|cultivable|holding)[^.]{0,80}/i, "Land/property criterion"],
  [/aadhaar|e-?kyc|bank/i, "Identity/KYC criterion"],
];

export function buildEligibilityMatrix(
  documentId: string,
  scheme: SchemeExtraction,
  documentText: string
): Requirement[] {
  const reqs: Requirement[] = [];
  let n = 0;
  const add = (
    requirement: string,
    extractedRule: string,
    userEvidence: string,
    status: Requirement["status"],
    missingEvidence: string
  ) => {
    n += 1;
    reqs.push({
      requirementId: `${documentId}-req-${n}`,
      requirement,
      extractedRule: extractedRule.slice(0, 500),
      userEvidence: userEvidence.slice(0, 500),
      status,
      evidenceIds: [],
      missingEvidence: missingEvidence.slice(0, 500),
      explanation:
        status === "SATISFIED"
          ? "Based on the available evidence, the uploaded document appears to establish this."
          : status === "NOT_SATISFIED"
            ? "Based on the available evidence, the document indicates this is not met."
            : "Based on the available evidence, this cannot be established yet — further evidence is needed, not a negative finding.",
    });
  };

  for (const rule of scheme.eligibilityRules) {
    const label = RULE_LABELS.find(([re]) => re.test(rule))?.[1] ?? "Scheme criterion";
    const mentioned = new RegExp(rule.split(/\s+/).slice(0, 4).join("\\s+"), "i").test(documentText);
    add(
      label,
      rule,
      mentioned ? "Mentioned in the uploaded document." : "",
      mentioned ? "INSUFFICIENT_EVIDENCE" : "UNKNOWN",
      mentioned ? "Supporting proof document still needed." : "No evidence in the uploaded document; check official sources."
    );
  }
  for (const ex of scheme.exclusions.slice(0, 8)) {
    add(`Exclusion check: ${ex.slice(0, 120)}`, ex, "", "UNKNOWN", "Evidence ruling this exclusion in or out.");
  }
  if (reqs.length === 0) {
    add(
      "General eligibility",
      "No specific eligibility rules found in the available official material.",
      "",
      "UNKNOWN",
      "Official scheme criteria document."
    );
  }
  return reqs;
}

function docState(docName: string, documentText: string): SchemeDocument["state"] {
  const t = documentText.toLowerCase();
  const key = docName.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
  if (key.length === 0) return "unknown";
  const hits = key.filter((w) => t.includes(w)).length;
  if (hits === key.length) return "provided";
  if (hits > 0) return "incomplete";
  return "missing";
}

export function buildChecklist(
  documentId: string,
  scheme: SchemeExtraction,
  documentText: string
): SchemeDocument[] {
  return scheme.requiredDocuments.map((d) => {
    const state = docState(d, documentText);
    return {
      documentName: d,
      whyRequired: `Listed as required for ${scheme.schemeName ?? "this scheme"} in the available official material.`,
      issuer: "",
      acceptableEvidence: "Original + photocopy as accepted at the counter.",
      validityRecency: "",
      state: state === "missing" ? "missing" : state === "provided" ? "provided" : state === "incomplete" ? "incomplete" : "unknown",
      source: scheme.officialSources[0] ?? "",
    };
  });
}

const RULE_QUESTIONS = [
  "What exactly is the rule?",
  "Who does it apply to?",
  "What evidence establishes it?",
  "What evidence is missing?",
  "Does the uploaded document establish it?",
  "Is the evidence current?",
  "Is another document required?",
  "Are there exceptions?",
  "Are there exclusions?",
  "What official source supports the interpretation?",
];

export function buildSchemeQuestions(documentId: string, reqs: Requirement[]): SchemeQuestion[] {
  const out: SchemeQuestion[] = [];
  let n = 0;
  for (const r of reqs.slice(0, 12)) {
    for (const q of RULE_QUESTIONS) {
      n += 1;
      out.push({
        questionId: `${documentId}-sq-${n}`,
        requirementId: r.requirementId,
        question: `${q} (Re: ${r.requirement})`,
        questionStatus: "unanswered",
        answer: "",
      });
      if (out.length >= 120) return out;
    }
  }
  return out;
}
