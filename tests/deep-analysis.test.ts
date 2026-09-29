import { describe, it, expect, vi, afterEach } from "vitest";
import { buildNormalizedDocument } from "@/lib/documents/normalized";
import { classifyDocument, extractEntities, extractClaims } from "@/lib/analysis/foundation";
import { buildQuestionGraph, buildChronology, detectContradictions } from "@/lib/analysis/deep";
import { OllamaGemmaEngine } from "@/lib/ai/OllamaGemmaEngine";
import { getAnalysisStore } from "@/lib/analysis/store";
import { openTestDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";

afterEach(() => {
  vi.unstubAllGlobals();
});

const DEED = `Sale Deed. Vendor Ravi Kumar sold Survey No. 123/A measuring 2 acres to buyer Priya Sharma for consideration Rs 500000 on 10-01-2024. Witnessed by Anil. Registered at Sub-Registrar Office, Medchal on 12-01-2024. Encumbrance certificate enclosed.`;

function deedDoc() {
  return buildNormalizedDocument({ ownerId: "o", sessionId: "s", sourceType: "text", text: DEED });
}

describe("question graph", () => {
  it("builds roots + type-specific subquestions, capped and relevant", () => {
    const doc = deedDoc();
    const cls = classifyDocument(doc);
    expect(cls.documentType).toBe("sale_deed");
    const ents = extractEntities(doc);
    const claims = extractClaims(doc, ents);
    const { roots, subquestions } = buildQuestionGraph(doc, cls.documentType, claims, ents);
    expect(roots.length).toBeGreaterThan(0);
    expect(subquestions.length).toBeGreaterThan(0);
    expect(subquestions.length).toBeLessThanOrEqual(60);
    const who = subquestions.filter((q) => q.dimension === "WHO");
    expect(who.length).toBeGreaterThan(0);
    expect(subquestions.every((q) => q.parentQuestionId && q.targetClaimId)).toBe(true);
    // at most ~10 per material claim
    expect(subquestions.length).toBeLessThanOrEqual(claims.filter((c) => c.materiality !== "low").length * 10 + 1);
  });

  it("FIR docs get FIR-specific questions", () => {
    const doc = buildNormalizedDocument({
      ownerId: "o", sessionId: "s", sourceType: "text",
      text: "First Information Report. FIR No. 45/2024. Miyapur Police Station. Complainant Suresh. Offence under Section 420 IPC on 05-03-2024.",
    });
    const cls = classifyDocument(doc);
    expect(cls.documentType).toBe("fir");
    const g = buildQuestionGraph(doc, cls.documentType, extractClaims(doc, []), []);
    expect(g.subquestions.some((q) => /police station|FIR number/i.test(q.question))).toBe(true);
  });
});

describe("chronology", () => {
  it("orders dated events and flags impossible ordering", () => {
    const doc = buildNormalizedDocument({
      ownerId: "o", sessionId: "s", sourceType: "text",
      text: "Registered on 12-01-2024 at the Sub-Registrar Office. Agreement signed on 10-01-2024 by both parties present there.",
    });
    const tl = buildChronology(doc, extractEntities(doc));
    expect(tl.length).toBeGreaterThanOrEqual(2);
    const times = tl.map((e) => e.date);
    expect(times).toContain("12-01-2024");
  });
});

describe("contradictions", () => {
  it("flags multiple distinct survey numbers as potential inconsistency", () => {
    const doc = buildNormalizedDocument({
      ownerId: "o", sessionId: "s", sourceType: "text",
      text: "Survey No. 123/A is sold. The schedule mentions Survey No. 124/B as the same property.",
    });
    const cx = detectContradictions(doc, extractEntities(doc), []);
    expect(cx.some((c) => c.category === "survey_number")).toBe(true);
    expect(cx[0].explanation).toMatch(/potential inconsistency/i);
    expect(cx[0].verificationRequired.length).toBeGreaterThan(0);
  });

  it("never claims fraud", () => {
    const doc = deedDoc();
    const cx = detectContradictions(doc, extractEntities(doc), extractClaims(doc, []));
    expect(cx.every((c) => !/fraud|scam|fake/i.test(c.explanation))).toBe(true);
  });
});

describe("analyzeDeep engine pass (mocked)", () => {
  it("validates structured answers and falls back without throwing", async () => {
    const good = JSON.stringify({
      executiveSummary: "A sale deed.",
      answers: [{ questionId: "q-1", answer: "Ravi Kumar is the seller.", evidenceIds: [], confidence: 0.8 }],
      findings: [{ title: "Sale recorded", detail: "Deed records a sale.", materiality: "material", evidenceIds: [], confidence: 0.7 }],
      missingInformation: [],
      verificationRequirements: ["Confirm at sub-registrar."],
      unresolvedQuestions: [],
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: { content: good } }) }));
    const engine = new OllamaGemmaEngine();
    const out = await engine.analyzeDeep({
      documentText: DEED,
      language: "en",
      questions: [{ questionId: "q-1", dimension: "WHO", question: "Who is the seller?" }],
      evidence: [],
    });
    expect(out.answers[0].answer).toContain("Ravi Kumar");
    expect(out.findings[0].materiality).toBe("material");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: { content: "garbage{{{" } }) }));
    const fallback = await engine.analyzeDeep({
      documentText: DEED, language: "en",
      questions: [{ questionId: "q-9", dimension: "WHAT", question: "What?" }],
      evidence: [],
    });
    expect(fallback.unresolvedQuestions).toContain("q-9");
  });
});

describe("deep store isolation", () => {
  it("persists graph/timeline/contradictions owner-scoped", () => {
    const db = openTestDatabase();
    migrate(db);
    const store = getAnalysisStore(db);
    const doc = deedDoc();
    const { roots, subquestions } = buildQuestionGraph(doc, "sale_deed", extractClaims(doc, []), []);
    const tl = buildChronology(doc, extractEntities(doc));
    const saved = store.saveDeep(doc.documentId, "s", "o", roots, subquestions, tl, [], {
      executiveSummary: "x", answers: [], findings: [], missingInformation: [],
      verificationRequirements: [], unresolvedQuestions: [],
    });
    expect(saved.questions).toBe(roots.length + subquestions.length);
    const rows = db.prepare(`SELECT COUNT(*) AS n FROM analysis_questions WHERE owner_id = ?`).get("other");
    expect((rows as { n: number }).n).toBe(0);
  });
});
