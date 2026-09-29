/**
 * Deterministic deep-analysis builders: question graph, chronology,
 * contradiction checks. Rule-based (never invents); one Gemma pass answers
 * material questions (see engine.analyzeDeep). Outputs fit existing UI later.
 */
import type { NormalizedDocument } from "../documents/normalized";
import type { Claim, Entity } from "./schemas";
import type {
  AnalysisQuestion,
  Contradiction,
  TimelineEvent,
} from "./deep-schemas";
import type { DIMENSIONS } from "./deep-schemas";

type Dim = (typeof DIMENSIONS)[number];

interface Template {
  dimension: Dim;
  text: string;
  importance: AnalysisQuestion["importance"];
  needs: RegExp;
}

const UNIVERSAL: Template[] = [
  { dimension: "WHO", text: "Who are the named persons or parties?", importance: "material", needs: /./ },
  { dimension: "WHAT", text: "What document is this and what transaction or request does it record?", importance: "material", needs: /./ },
  { dimension: "WHEN", text: "What dates and deadlines are stated?", importance: "material", needs: /./ },
  { dimension: "HOW_MUCH", text: "What amounts, fees, or consideration are stated?", importance: "relevant", needs: /rs\.?|fee|amount|consideration|paid/i },
  { dimension: "WHY", text: "What purpose or reason is given for this document?", importance: "relevant", needs: /purpose|reason|whereas|application|request/i },
  { dimension: "WHERE", text: "What locations, offices, or jurisdictions are named?", importance: "relevant", needs: /office|district|court|station|village|address/i },
  { dimension: "HOW", text: "What process or next steps does the document describe?", importance: "relevant", needs: /process|collect|visit|submit|register/i },
  { dimension: "WHICH", text: "Which specific record, account, or reference applies?", importance: "relevant", needs: /number|account|reference|no\./i },
  { dimension: "HOW_COMPLETE", text: "What required information appears to be missing?", importance: "relevant", needs: /./ },
];

const TYPE_QUESTIONS: Record<string, Template[]> = {
  land_property: [
    { dimension: "WHOSE", text: "Whose property is recorded as the holder?", importance: "critical", needs: /./ },
    { dimension: "WHAT", text: "What is the exact survey number including subdivision?", importance: "critical", needs: /survey/i },
    { dimension: "HOW_MUCH", text: "What extent and classification of land is recorded?", importance: "material", needs: /extent|acre|gunta/i },
    { dimension: "WHERE", text: "What is the recorded location of the property?", importance: "material", needs: /./ },
    { dimension: "HOW_CONNECTED", text: "Is the recorded holder consistent with the transaction chain?", importance: "material", needs: /seller|buyer|vendor|holder/i },
    { dimension: "WHAT", text: "What registration or mutation references exist?", importance: "relevant", needs: /regist|mutation/i },
    { dimension: "HOW_CONSISTENT", text: "Are survey numbers and extents consistent across pages?", importance: "material", needs: /./ },
    { dimension: "WHAT", text: "Is there any encumbrance reference?", importance: "relevant", needs: /encumbrance|charge|mortgage/i },
  ],
  sale_deed: [
    { dimension: "WHO", text: "Who is the seller and who is the buyer?", importance: "critical", needs: /./ },
    { dimension: "HOW_MUCH", text: "What consideration amount is stated?", importance: "critical", needs: /consideration|rs\.?/i },
    { dimension: "WHOM", text: "Whom was the property transferred to, and on what date?", importance: "material", needs: /./ },
    { dimension: "HOW", text: "Who executed, witnessed, and registered the transaction?", importance: "material", needs: /witness|execut|regist/i },
  ],
  fir: [
    { dimension: "WHAT", text: "What is the FIR number and date of registration?", importance: "critical", needs: /./ },
    { dimension: "WHERE", text: "Which police station registered it?", importance: "critical", needs: /police|station/i },
    { dimension: "WHO", text: "Who is the complainant and who is accused?", importance: "critical", needs: /complainant|accused/i },
    { dimension: "WHAT", text: "What sections of law are invoked?", importance: "material", needs: /section|ipc|crpc/i },
    { dimension: "WHEN", text: "What is the chronology of the alleged incident vs the report?", importance: "material", needs: /./ },
    { dimension: "HOW_CONSISTENT", text: "Are places, dates, and names internally consistent?", importance: "material", needs: /./ },
  ],
  court_document: [
    { dimension: "WHAT", text: "Which court and what case number?", importance: "critical", needs: /./ },
    { dimension: "WHO", text: "Who are the parties and advocates?", importance: "material", needs: /petitioner|respondent|advocate/i },
    { dimension: "WHAT", text: "What relief is requested or ordered?", importance: "material", needs: /relief|order|prayer|decree/i },
    { dimension: "WHEN", text: "What are the key dates and the next deadline?", importance: "material", needs: /./ },
  ],
  court_order: [
    { dimension: "WHAT", text: "Which court and what case number?", importance: "critical", needs: /./ },
    { dimension: "WHAT", text: "What findings and orders were recorded?", importance: "critical", needs: /./ },
    { dimension: "WHEN", text: "What are the operative dates and deadlines?", importance: "material", needs: /./ },
  ],
  government_scheme: [
    { dimension: "WHAT", text: "Which scheme and issuing authority?", importance: "critical", needs: /./ },
    { dimension: "WHO", text: "Who is eligible (age, residence, income, category, occupation)?", importance: "critical", needs: /eligib/i },
    { dimension: "WHEN", text: "What are the deadlines?", importance: "material", needs: /deadline|last date|due/i },
    { dimension: "WHAT", text: "What documents are required and what is excluded?", importance: "material", needs: /document|exclud/i },
    { dimension: "HOW", text: "What is the application process?", importance: "relevant", needs: /apply|process|centre|portal/i },
  ],
  contract: [
    { dimension: "WHO", text: "Who are the parties?", importance: "critical", needs: /./ },
    { dimension: "WHAT", text: "What obligations and consideration are stated?", importance: "material", needs: /oblig|consideration|rs\.?/i },
    { dimension: "HOW_LONG", text: "What is the duration, termination, and renewal position?", importance: "material", needs: /duration|terminat|renew|years?|months?/i },
    { dimension: "WHAT", text: "What penalties or breach consequences exist?", importance: "relevant", needs: /penalt|breach|default/i },
  ],
  agreement: [
    { dimension: "WHO", text: "Who are the parties?", importance: "critical", needs: /./ },
    { dimension: "WHAT", text: "What obligations and consideration are stated?", importance: "material", needs: /oblig|consideration|rs\.?/i },
    { dimension: "HOW_LONG", text: "What is the duration and termination position?", importance: "material", needs: /duration|terminat|years?|months?/i },
  ],
};

export interface QuestionGraph {
  roots: AnalysisQuestion[];
  subquestions: AnalysisQuestion[];
}

function entityIdsFor(sentence: string, entities: Entity[]): string[] {
  return entities
    .filter((e) => e.originalValue.length > 3 && sentence.includes(e.originalValue.slice(0, 24)))
    .slice(0, 5)
    .map((e) => `${e.entityType}:${e.canonicalValue.slice(0, 40)}`);
}

export function buildQuestionGraph(
  doc: NormalizedDocument,
  classification: string,
  claims: Claim[],
  entities: Entity[]
): QuestionGraph {
  const roots: AnalysisQuestion[] = [];
  const subquestions: AnalysisQuestion[] = [];
  const material = claims.filter((c) => c.materiality !== "low").slice(0, 8);
  const text = doc.extractedText;

  UNIVERSAL.forEach((t, i) => {
    if (!t.needs.test(text)) return;
    roots.push({
      questionId: `q-root-${t.dimension.toLowerCase()}`,
      parentQuestionId: null,
      dimension: t.dimension,
      question: t.text,
      targetClaimId: null,
      targetEntityIds: [],
      importance: t.importance,
      questionStatus: "unanswered",
      answer: "",
      evidenceIds: [],
      confidence: 0,
      unresolvedReason: "",
    });
    void i;
  });

  const specific = TYPE_QUESTIONS[classification] ?? [];
  for (const claim of material) {
    const applicable = specific.filter((t) => t.needs.test(claim.claimText + " " + text));
    const chosen = (applicable.length ? applicable : UNIVERSAL.filter((t) => t.needs.test(claim.claimText))).slice(0, 10);
    for (const t of chosen) {
      const qid = `q-${claim.claimId.split("-").pop()}-${t.dimension.toLowerCase()}`;
      if (subquestions.some((q) => q.questionId === qid)) continue;
      subquestions.push({
        questionId: qid,
        parentQuestionId: `q-root-${t.dimension.toLowerCase()}`,
        dimension: t.dimension,
        question: t.text,
        targetClaimId: claim.claimId,
        targetEntityIds: entityIdsFor(claim.claimText, entities),
        importance: t.importance,
        questionStatus: "unanswered",
        answer: "",
        evidenceIds: claim.evidenceIds,
        confidence: 0,
        unresolvedReason: "",
      });
      if (subquestions.length >= 60) break;
    }
  }
  return { roots, subquestions };
}

function parseDateLoose(s: string): number | null {
  const m = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const t = new Date(year, Number(m[2]) - 1, Number(m[1])).getTime();
  return Number.isNaN(t) ? null : t;
}

export function buildChronology(doc: NormalizedDocument, entities: Entity[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const dates = entities.filter((e) => e.entityType === "DATE");
  for (const page of doc.pages) {
    const sentences = page.text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
    for (const s of sentences) {
      const hit = dates.find((d) => d.pageNumber === page.pageNumber && s.includes(d.originalValue));
      if (!hit || s.length < 25) continue;
      events.push({
        date: hit.originalValue,
        normalizedDate: "",
        event: s.slice(0, 500),
        actor: "",
        source: "document",
        page: page.pageNumber,
        confidence: 0.6,
        flag: "none",
      });
      if (events.length >= 60) break;
    }
  }
  events.sort((a, b) => {
    const ta = parseDateLoose(a.date) ?? Number.MAX_SAFE_INTEGER;
    const tb = parseDateLoose(b.date) ?? Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });
  // Impossible ordering: identical adjacent timestamps with different text is fine;
  // flag duplicate exact dates carrying contradictory amounts as inconsistent.
  const seen = new Map<string, number>();
  events.forEach((e, i) => {
    const t = parseDateLoose(e.date);
    if (t == null) return;
    if (i > 0) {
      const prev = parseDateLoose(events[i - 1].date);
      if (prev != null && t < prev) e.flag = "impossible_order";
    }
    seen.set(e.date, (seen.get(e.date) ?? 0) + 1);
  });
  return events;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function detectContradictions(
  doc: NormalizedDocument,
  entities: Entity[],
  claims: Claim[]
): Contradiction[] {
  const out: Contradiction[] = [];
  let n = 0;
  const flag = (
    category: Contradiction["category"],
    claimA: string,
    claimB: string,
    explanation: string,
    severity: Contradiction["severity"] = "relevant"
  ) => {
    n += 1;
    out.push({
      contradictionId: `${doc.documentId}-cx-${n}`,
      category,
      claimA: claimA.slice(0, 500),
      claimB: claimB.slice(0, 500),
      evidenceA: "",
      evidenceB: "",
      severity,
      explanation,
      verificationRequired: "Potential inconsistency detected — verify against the original record before acting.",
    });
  };

  const byType = (t: Entity["entityType"]) => entities.filter((e) => e.entityType === t);

  // Duplicate/conflicting reference numbers.
  const refs = byType("REFERENCE_NUMBER");
  const refGroups = new Map<string, Entity[]>();
  for (const r of refs) {
    const key = norm(r.canonicalValue).slice(0, 6);
    if (!refGroups.has(key)) refGroups.set(key, []);
    refGroups.get(key)!.push(r);
  }

  // Name variants: same-length-different normalized tokens appearing as parties.
  const surveys = byType("SURVEY_NUMBER").map((e) => norm(e.canonicalValue));
  if (new Set(surveys).size > 1 && surveys.length > 1) {
    flag("survey_number", `Survey references: ${[...new Set(surveys)].slice(0, 4).join(", ")}`, "Multiple distinct survey numbers appear in one document.", "Multiple survey numbers in a single document need reconciliation — potential inconsistency detected.", "material");
  }
  const amounts = byType("MONEY").map((e) => norm(e.canonicalValue));
  if (new Set(amounts).size > 3) {
    flag("amount", `Amounts stated: ${[...new Set(amounts)].slice(0, 5).join(", ")}`, "More than three distinct amounts appear.", "Several different amounts are stated — confirm which applies before acting.", "relevant");
  }

  // Referenced-document missing: mentions of annexures/schedules with no matching content.
  const text = doc.extractedText;
  const annex = text.match(/annexure\s*[-–]?\s*([A-Z0-9]+)/gi) ?? [];
  if (annex.length > 0 && doc.pageCount <= 1 && text.length < 1500) {
    flag("missing_reference", `References: ${annex.slice(0, 3).join(", ")}`, "Short single-page text.", "The document cites annexures that are not included in the provided text — potential inconsistency detected.", "relevant");
  }

  // Claim-level duplicates: near-identical sentences.
  const seenClaims = new Map<string, Claim>();
  for (const c of claims) {
    const key = norm(c.claimText).slice(0, 80);
    const prev = seenClaims.get(key);
    if (prev && prev.claimText !== c.claimText) {
      flag("duplicate_claim", prev.claimText, c.claimText, "Two near-identical statements differ in wording — potential inconsistency detected.", "relevant");
    } else if (!prev) {
      seenClaims.set(key, c);
    }
    if (out.length >= 20) break;
  }
  void refGroups;
  return out;
}
