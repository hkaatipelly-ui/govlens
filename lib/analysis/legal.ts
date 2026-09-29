/**
 * Legal & case intelligence builders (deterministic, no model calls).
 * Roles are assigned ONLY from explicit role language near a name — never
 * inferred from a bare name. Analysis assistant only: never a court, never
 * legal counsel, never an authenticity verdict.
 */
import type { NormalizedDocument } from "../documents/normalized";
import type { Claim } from "./schemas";
import type { Contradiction } from "./deep-schemas";
import type {
  DocRelationship,
  LegalHeader,
  MatrixEntry,
  Party,
  Provision,
} from "./legal-schemas";
import type { PARTY_ROLES } from "./legal-schemas";
import { LEGAL_CATEGORIES } from "./legal-schemas";

export function isLegalLike(classification: string, text: string): boolean {
  if (LEGAL_CATEGORIES.has(classification)) return true;
  return /\bcourt\b|fir\b|affidavit|petition|deed|advocate|police|legal notice|agreement|tribunal/i.test(text);
}

const first = (text: string, re: RegExp): string | null => {
  const m = text.match(re);
  return m ? ((m[1] ?? m[0]).trim().slice(0, 300) || null) : null;
};

const all = (text: string, re: RegExp, max = 20): string[] => {
  const out: string[] = [];
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  for (const m of text.matchAll(g)) {
    const v = (m[1] ?? m[0]).trim().replace(/\s+/g, " ");
    if (v && !out.includes(v)) out.push(v.slice(0, 300));
    if (out.length >= max) break;
  }
  return out;
};

export function extractLegalHeader(text: string): LegalHeader {
  return {
    court: first(text, /((?:District|Sessions|High|Supreme|Family|Labour|Consumer) Court[^,\n]{0,60})/i),
    jurisdiction: first(text, /jurisdiction\s*(?:of\s*)?([^.\n]{2,80})/i),
    caseNumber: first(text, /(?:Case|C\.?\s*No\.?|O\.?S\.?|Crl\.?P\.?|W\.?P\.?)\s*(?:No\.?|Number)?\s*[:\-]?\s*([A-Z0-9/-]+)/i),
    cnr: first(text, /\bCNR\s*(?:No\.?|Number)?\s*[:\-]?\s*([A-Z0-9-]+)/i),
    firNumber: first(text, /\bFIR\b\s*(?:No\.?|Number)?\s*[:\-]?\s*([A-Z0-9/-]+)/i),
    policeStation: first(text, /([A-Z][A-Za-z ]*?Police Station)/),
    filingNumber: first(text, /filing\s*(?:No\.?|Number)?\s*[:\-]?\s*([A-Z0-9/-]+)/i),
    caseType: first(text, /(?:case type|nature of case)\s*[:\-]?\s*([^.\n]{2,60})/i),
    registrationYear: first(text, /\b((?:19|20)\d{2})\b/),
    parties: namesAfterKeywords(
      text,
      /(petitioner|respondent|plaintiff|defendant|complainant|accused|appellant)\s+/gi
    ),
    advocates: namesAfterKeywords(text, /(?:Adv\.?\s+|Advocate\s+)/g),
    dates: [...new Set([...text.matchAll(/\b(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/g)].map((m) => m[1]))].slice(0, 20),
    statutes: all(text, /((?:Indian Penal Code|Code of Criminal Procedure|Indian Evidence Act|Registration Act|Transfer of Property Act|Specific Relief Act)[^.\n]{0,40})/gi, 20),
    sections: all(text, /\b(?:Section|Sec\.?|U\/S)\s*(\d+[A-Z]?(?:\s*(?:IPC|Cr\.?PC|CPC))?)/gi, 20),
    orders: all(text, /(?:ordered|directed|decreed|held)[^.]{0,200}\./gi, 10),
  };
}

type Role = (typeof PARTY_ROLES)[number];

// Keywords stay case-insensitive; the NAME capture below is case-SENSITIVE
// on purpose ([A-Z] with /i would swallow lowercase words).
const ROLE_KEYWORDS: Array<[Role, RegExp]> = [
  ["petitioner", /petitioner\s+/i],
  ["respondent", /respondent\s+/i],
  ["plaintiff", /plaintiff\s+/i],
  ["defendant", /defendant\s+/i],
  ["complainant", /complainant\s+/i],
  ["accused", /accused\s+/i],
  ["appellant", /appellant\s+/i],
  ["witness", /witness\s+/i],
  ["advocate", /(?:Adv\.?\s+|Advocate\s+)/],
];

const NAME_RE = /^([A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*){0,3})/;
const LEAD_NUM_RE = /^(?:is\s+|No\.?\s*\d+\s*)?/i;

/** Case-sensitive name capture after each keyword hit (shared helper). */
function namesAfterKeywords(text: string, kw: RegExp, max = 20): string[] {
  const out: string[] = [];
  const g = new RegExp(kw.source, kw.flags.includes("g") ? kw.flags : kw.flags + "g");
  for (const m of text.matchAll(g)) {
    if (m.index === undefined) continue;
    const tail = text.slice(m.index + m[0].length).replace(LEAD_NUM_RE, "");
    const nm = tail.match(NAME_RE);
    if (!nm) continue;
    const name = nm[1].trim().replace(/\s+/g, " ");
    if (name.length >= 3 && name.length <= 80 && !out.includes(name)) out.push(name);
    if (out.length >= max) break;
  }
  return out;
}

export function buildPartyGraph(
  documentId: string,
  text: string,
  claims: Claim[]
): Party[] {
  const parties: Party[] = [];
  const seen = new Set<string>();
  let n = 0;
  for (const [role, kw] of ROLE_KEYWORDS) {
    const g = new RegExp(kw.source, kw.flags.includes("g") ? kw.flags : kw.flags + "g");
    for (const m of text.matchAll(g)) {
      if (m.index === undefined) continue;
      const tail = text.slice(m.index + m[0].length).replace(LEAD_NUM_RE, "");
      const nm = tail.match(NAME_RE);
      if (!nm) continue;
      const name = nm[1].trim().replace(/\s+/g, " ");
      if (name.length < 3 || name.length > 80) continue;
      const key = `${role}:${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      n += 1;
      const related = claims
        .filter((c) => c.claimText.includes(name.split(" ")[0]) && name.split(" ")[0].length > 3)
        .slice(0, 10)
        .map((c) => c.claimId);
      parties.push({
        partyId: `${documentId}-party-${n}`,
        name,
        role,
        roleEvidence: text.slice(Math.max(0, m.index - 20), m.index + m[0].length + 60).slice(0, 500),
        claims: related,
        actions: [],
        documents: [documentId],
        dates: [],
        relationships: [],
        evidence: related,
      });
      if (parties.length >= 30) return parties;
    }
  }
  return parties;
}

export function extractProvisions(doc: NormalizedDocument): Provision[] {
  const out: Provision[] = [];
  const seen = new Set<string>();
  const patterns: Array<[Provision["kind"], RegExp]> = [
    ["section", /\b(?:Section|Sec\.?|U\/S)\s*\d+[A-Z]?(?:\s*(?:IPC|Cr\.?PC|CPC))?/gi],
    ["act", /(Indian Penal Code|Code of Criminal Procedure|Indian Evidence Act|Registration Act|Transfer of Property Act|Specific Relief Act|Limitation Act)/gi],
    ["order", /Government Order[^.\n]{0,60}/gi],
    ["notification", /notification[^.\n]{0,80}/gi],
    ["judgment", /judgment[^.\n]{0,80}|\b[A-Z][a-z]+\s+v\.?\s+[A-Z][a-z]+/g],
  ];
  for (const page of doc.pages) {
    for (const [kind, re] of patterns) {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      for (const m of page.text.matchAll(g)) {
        const ref = m[0].trim().replace(/\s+/g, " ").slice(0, 300);
        const key = `${kind}:${ref.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ reference: ref, kind, pageNumber: page.pageNumber });
        if (out.length >= 60) return out;
      }
    }
  }
  return out;
}

export function buildClaimEvidenceMatrix(
  claims: Claim[],
  contradictions: Contradiction[]
): MatrixEntry[] {
  return claims.slice(0, 100).map((c) => {
    const related = contradictions.filter(
      (x) => x.claimA.includes(c.claimText.slice(0, 40)) || x.claimB.includes(c.claimText.slice(0, 40))
    );
    return {
      claimId: c.claimId,
      claimText: c.claimText,
      supporting: c.evidenceIds.slice(0, 10),
      contradicting: related.map((x) => x.contradictionId).slice(0, 10),
      missing: [],
      sourcePage: c.sourcePage,
      status: related.length > 0 ? ("requires_human_review" as const) : c.verificationStatus === "extracted" ? ("unresolved" as const) : ("supported" as const),
    };
  });
}

export function buildRelationships(
  documentId: string,
  text: string
): DocRelationship[] {
  const out: DocRelationship[] = [];
  const patterns: Array<{ relation: DocRelationship["relation"]; re: RegExp }> = [
    { relation: "references", re: /(?:vide|see|as per|under|referred (?:in|to)|annexure|exhibit|schedule)\s*[-–:]?\s*([A-Z0-9][A-Z0-9 /.-]{1,60})/gi },
    { relation: "contradicts", re: /contrary to|contradicts?|inconsistent with\s*([^.\n]{2,80})/gi },
    { relation: "supports", re: /(?:corroborated?|supported?) by\s*([^.\n]{2,80})/gi },
    { relation: "amends", re: /(?:amends?|modifies?|supersedes?)\s*([^.\n]{2,80})/gi },
    { relation: "encloses", re: /(?:enclosed?|attached?|appended?)(?: herewith)?\s*([^.\n]{2,80})?/gi },
  ];
  for (const { relation, re } of patterns) {
    for (const m of text.matchAll(re)) {
      const ref = (m[1] ?? m[0]).trim().replace(/\s+/g, " ").slice(0, 300);
      if (!ref || ref.length < 2) continue;
      out.push({ fromDocumentId: documentId, toReference: ref, relation, evidence: m[0].slice(0, 500) });
      if (out.length >= 30) return out;
    }
  }
  return out;
}

export interface CrossDocResult {
  mergedTimelineNotes: string[];
  crossContradictions: Contradiction[];
  relationships: DocRelationship[];
}

/**
 * Multi-document analysis WITHOUT concatenating everything into one prompt:
 * operates on per-document artifacts (entities, claims, timelines).
 */
export function crossDocumentAnalysis(
  docs: Array<{
    documentId: string;
    classification: string;
    entities: Array<{ entityType: string; canonicalValue: string }>;
    claims: Claim[];
    timeline: Array<{ date: string; event: string }>;
  }>
): CrossDocResult {
  const notes: string[] = [];
  const crossContradictions: Contradiction[] = [];
  const relationships: DocRelationship[] = [];
  if (docs.length < 2) {
    return { mergedTimelineNotes: [], crossContradictions, relationships };
  }
  // Party/role consistency across documents.
  const nameDocs = new Map<string, Set<string>>();
  for (const d of docs) {
    for (const e of d.entities) {
      if (!["PERSON", "REFERENCE_NUMBER", "CASE", "FIR", "SURVEY_NUMBER"].includes(e.entityType)) continue;
      const key = `${e.entityType}:${e.canonicalValue.toLowerCase()}`;
      if (!nameDocs.has(key)) nameDocs.set(key, new Set());
      nameDocs.get(key)!.add(d.documentId);
    }
  }
  let n = 0;
  for (const [key, set] of nameDocs) {
    if (set.size > 1) {
      notes.push(`${key} appears in ${set.size} documents (${[...set].join(", ")}).`);
    }
  }
  // Same survey/case number with different surrounding text across docs → review.
  const surveyTexts = new Map<string, Array<{ doc: string; ctx: string }>>();
  for (const d of docs) {
    for (const c of d.claims) {
      const m = c.claimText.match(/Survey\s*(?:No\.?|Number)?\s*[:\-]?\s*(\d+[A-Z]?(?:\/[A-Z0-9]+)?)/i);
      if (!m) continue;
      const list = surveyTexts.get(m[1]) ?? [];
      list.push({ doc: d.documentId, ctx: c.claimText.slice(0, 200) });
      surveyTexts.set(m[1], list);
    }
  }
  for (const [survey, list] of surveyTexts) {
    const distinct = new Set(list.map((l) => l.ctx.slice(0, 60)));
    if (list.length > 1 && distinct.size > 1) {
      n += 1;
      crossContradictions.push({
        contradictionId: `cross-${n}`,
        category: "survey_number",
        claimA: `${list[0].doc}: ${list[0].ctx}`,
        claimB: `${list[1].doc}: ${list[1].ctx}`,
        evidenceA: "",
        evidenceB: "",
        severity: "material",
        explanation: `Survey No. ${survey} is described differently across documents — potential inconsistency detected.`,
        verificationRequired: "Compare the original records from each document before acting.",
      });
    }
  }
  return { mergedTimelineNotes: notes.slice(0, 20), crossContradictions, relationships };
}
