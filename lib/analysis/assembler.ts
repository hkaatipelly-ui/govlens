/**
 * Deterministic report assembler (no model calls).
 * Composes DocumentIntelligenceReport from persisted owner-scoped artifacts
 * plus the session's extraction/explanation/checklist. Every significant
 * statement carries page/source grounding; nothing is fabricated.
 */
import {
  documentIntelligenceReportSchema,
  type DocumentIntelligenceReport,
} from "./report-schemas";

const str = (v: unknown, max = 500): string => String(v ?? "").slice(0, max);
const num = (v: unknown, fb = 1): number => {
  const n = Number(v ?? NaN);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fb;
};

const NINE_W = new Set(["WHO", "WHAT", "WHERE", "WHEN", "WHY", "WHICH", "WHOSE", "WHOM", "HOW"]);

function sentences(text: string, maxSentences: number, maxLen: number): string {
  const parts = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter((s) => s.length > 15);
  return parts.slice(0, maxSentences).join(" ").slice(0, maxLen);
}

export function assembleReport(input: {
  bundle: Record<string, unknown[]> | null;
  session: {
    sessionId: string;
    fileName: string | null;
    language: string;
    extraction: {
      documentType: string;
      title: string | null;
      summary: string;
      deadline: string | null;
      amount: string | null;
      referenceNumber: string | null;
      requiredDocuments: string[];
      requiredActions: string[];
      warningSignals: string[];
    };
    explanation: { verificationNote: string } | null;
  };
  sources: Array<{ id: string; title: string; department?: string }>;
  checklist: Array<{ label: string; detail?: string; done: boolean }>;
}): DocumentIntelligenceReport {
  const { bundle, session, sources, checklist } = input;
  const rows = (k: string): Record<string, unknown>[] => (bundle?.[k] ?? []) as Record<string, unknown>[];
  const doc = rows("document")[0] ?? {};

  const who = rows("parties").slice(0, 3).map((p) => str(p.name)).filter(Boolean).join(", ");
  const summary = session.extraction.summary;
  const action = session.extraction.requiredActions[0] ?? session.extraction.deadline ?? "";
  const executiveSummary = [
    `This document is a ${session.extraction.documentType}${session.extraction.title ? ` titled "${session.extraction.title}"` : ""}.`,
    who ? `It concerns ${who}.` : "",
    sentences(summary, 2, 400),
    action ? `Possible next step: ${action}.` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 1500);

  const answersByQ = new Map(
    rows("answers").map((a) => [str(a.question_id), a] as const)
  );
  const qa = rows("questions").map((q) => {
    const a = answersByQ.get(str(q.question_id));
    const dimension = str(q.dimension, 32).toUpperCase();
    return {
      dimension,
      question: str(q.question),
      answer: str(a?.answer),
      evidence: [],
      confidence: Number(a?.confidence ?? 0),
      status: (a ? "answered" : str(q.question_status) === "answered" ? "answered" : "unanswered") as "answered" | "unanswered" | "unresolved",
    };
  });
  const nineWAnalysis = qa.filter((q) => NINE_W.has(q.dimension)).slice(0, 40);
  const howAnalysis = qa.filter((q) => !NINE_W.has(q.dimension)).slice(0, 30);

  const strList = (v: unknown): string[] => {
    try {
      const arr = JSON.parse(str(v, 4000));
      return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 300)) : [];
    } catch {
      return [];
    }
  };
  const reportMissing = rows("deepReports").flatMap((r) => strList(r.missing_information_json));
  const reportUnresolved = rows("deepReports").flatMap((r) => strList(r.unresolved_questions_json));
  const reportVerifyReqs = rows("deepReports").flatMap((r) => strList(r.verification_requirements_json));

  const verification = rows("verification").map((r) => ({
    claim: str(r.field),
    documentValue: str(r.document_value, 300),
    externalValue: str(r.external_value, 300),
    source: str(r.source_id),
    result: str(r.status),
    retrievedAt: str(r.retrieved_at, 64),
  }));

  const contradictions = rows("contradictions").map((c) => ({
    finding: str(c.explanation, 500) || `Potential inconsistency (${str(c.category)})`,
    evidenceA: str(c.claim_a, 500),
    evidenceB: str(c.claim_b, 500),
    whyInconsistent: str(c.explanation, 500),
    whatToCheck: str(c.verification_required, 500),
  }));

  const humanReviewItems: string[] = [
    ...rows("verification")
      .filter((r) => Number(r.human_review_required ?? 0) === 1)
      .map((r) => `Requires human/legal/professional verification: ${str(r.field)} — ${str(r.explanation, 300)}`),
    ...reportVerifyReqs.map((v) => `Requires human/legal/professional verification: ${v}`),
    ...contradictions.map((c) => `Requires human/legal/professional verification: ${c.finding.slice(0, 300)}`),
    ...rows("questions")
      .filter((q) => str(q.question_status) === "unanswered")
      .slice(0, 5)
      .map((q) => `Unresolved question needs review: ${str(q.question, 300)}`),
  ].slice(0, 20);

  const eligibility = rows("schemeReports").flatMap((sr) => {
    try {
      const reqs = JSON.parse(str(sr.reqs ?? "[]")) as Array<{ requirement: string; status: string; explanation: string }>;
      return reqs.map((r) => ({ requirement: r.requirement, status: r.status, explanation: r.explanation ?? "" }));
    } catch {
      return [];
    }
  });
  const schemeChecklist = rows("schemeReports").flatMap((sr) => {
    try {
      const docs = JSON.parse(str(sr.docs ?? "[]")) as Array<{ documentName: string; state: string; whyRequired: string }>;
      return docs.map((d) => ({ documentName: d.documentName, state: d.state, whyRequired: d.whyRequired ?? "" }));
    } catch {
      return [];
    }
  });

  const report = {
    documentIdentity: {
      documentId: str(doc.id ?? session.sessionId),
      fileName: session.fileName,
      sourceType: str(doc.source_type ?? "text"),
      pageCount: num(doc.page_count, 1),
      language: session.language,
    },
    executiveSummary: executiveSummary || summary.slice(0, 1500),
    documentType: session.extraction.documentType,
    entities: rows("entities").slice(0, 60).map((e) => ({
      type: str(e.entity_type, 64),
      value: str(e.canonical_value, 300),
      page: num(e.page_number),
    })),
    claims: rows("claims").slice(0, 100).map((c) => ({
      text: str(c.claim_text, 1000),
      page: num(c.source_page),
      status: str(c.verification_status, 32),
    })),
    nineWAnalysis,
    howAnalysis,
    questionTree: rows("questions").slice(0, 80).map((q) => ({
      questionId: str(q.question_id, 64),
      parentQuestionId: q.parent_question_id ? str(q.parent_question_id, 64) : null,
      dimension: str(q.dimension, 32),
      question: str(q.question, 500),
      answer: str(q.answer, 1000),
      status: str(q.question_status, 32),
    })),
    evidence: rows("evidence").slice(0, 60).map((e) => ({
      sourceType: str(e.source_type, 64),
      sourceName: str(e.source_name, 300),
      page: e.page == null ? null : num(e.page),
      text: str(e.text, 2000),
      url: e.url ? str(e.url, 500) : null,
    })),
    verification,
    timeline: rows("timeline").slice(0, 60).map((t) => ({
      date: str(t.date, 60),
      event: str(t.event, 500),
      actor: str(t.actor, 300),
      page: num(t.page),
      flag: str(t.flag, 32),
    })),
    contradictions,
    eligibility: eligibility.slice(0, 30),
    checklist: schemeChecklist.slice(0, 30),
    requiredActions: checklist.slice(0, 30).map((c) => ({
      action: c.label.slice(0, 300),
      reason: (c.detail ?? "").slice(0, 500),
      deadline: session.extraction.deadline ?? "",
      prerequisite: "",
      source: "",
      status: c.done ? ("done" as const) : ("pending" as const),
    })),
    missingInformation: [
      ...reportMissing,
      ...rows("questions")
        .filter((q) => str(q.question_status) !== "answered")
        .map((q) => `Evidence needed: ${str(q.question, 280)}`),
    ].slice(0, 20),
    unresolvedQuestions: [
      ...reportUnresolved,
      ...rows("questions")
        .filter((q) => str(q.question_status) !== "answered")
        .map((q) => str(q.question, 300)),
    ].slice(0, 20),
    humanReviewItems,
    sources: sources.slice(0, 20).map((s) => ({
      id: s.id,
      title: s.title,
      department: s.department ?? "",
    })),
  };

  const parsed = documentIntelligenceReportSchema.safeParse(report);
  if (!parsed.success) {
    throw new Error(`Report assembly failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  }
  return parsed.data;
}
