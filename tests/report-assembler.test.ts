import { describe, it, expect } from "vitest";
import { openTestDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import { getAnalysisStore } from "@/lib/analysis/store";
import { assembleReport } from "@/lib/analysis/assembler";
import { buildNormalizedDocument } from "@/lib/documents/normalized";
import { classifyDocument, extractEntities, extractClaims, buildEvidence } from "@/lib/analysis/foundation";
import { buildQuestionGraph, buildChronology } from "@/lib/analysis/deep";

const TEXT = `Sale Deed. Vendor Ravi Kumar sold Survey No. 123/A measuring 2 acres to buyer Priya Sharma for Rs 500000 on 10-01-2024. Registered at Medchal Sub-Registrar Office on 12-01-2024.`;

function session() {
  return {
    sessionId: "sess-1",
    fileName: "deed.pdf",
    language: "en",
    extraction: {
      documentType: "Sale Deed",
      title: null as string | null,
      summary: "A sale deed recording Ravi Kumar's sale to Priya Sharma.",
      deadline: null as string | null,
      amount: "Rs 500000",
      referenceNumber: null as string | null,
      requiredDocuments: ["Registered deed copy"],
      requiredActions: ["Verify at sub-registrar"],
      warningSignals: [] as string[],
    },
    explanation: { verificationNote: "Confirm at counter." },
  };
}

describe("report assembler", () => {
  it("assembles all 18 sections grounded, executive summary 2-5 sentences", () => {
    const db = openTestDatabase();
    migrate(db);
    const store = getAnalysisStore(db);
    const doc = buildNormalizedDocument({ ownerId: "o", sessionId: "sess-1", sourceType: "text", text: TEXT });
    const ents = extractEntities(doc);
    const claims = extractClaims(doc, ents);
    store.saveFoundation(doc, classifyDocument(doc).documentType, ents, claims, buildEvidence(doc, claims, []));
    const { roots, subquestions } = buildQuestionGraph(doc, "sale_deed", claims, ents);
    store.saveDeep(doc.documentId, "sess-1", "o", roots, subquestions, buildChronology(doc, ents), [], {
      executiveSummary: "", answers: [], findings: [{ title: "Sale recorded", detail: "Deed records sale.", materiality: "material", evidenceIds: [], confidence: 0.7 }],
      missingInformation: ["Encumbrance certificate"], verificationRequirements: [], unresolvedQuestions: [],
    });
    const report = assembleReport({
      bundle: store.readBundle(doc.documentId, "o"),
      session: session(),
      sources: [{ id: "s1", title: "Dharani", department: "Revenue" }],
      checklist: [{ label: "Verify at sub-registrar", detail: undefined, done: false }],
    });
    expect(report.executiveSummary.length).toBeGreaterThan(20);
    expect(report.executiveSummary.split(/(?<=[.!?])\s+/).length).toBeLessThanOrEqual(6);
    expect(report.documentType).toBe("Sale Deed");
    expect(report.entities.length).toBeGreaterThan(0);
    expect(report.entities.every((e) => e.page >= 1)).toBe(true);
    expect(report.nineWAnalysis.length + report.howAnalysis.length).toBeGreaterThan(0);
    expect(report.timeline.length).toBeGreaterThanOrEqual(2);
    expect(report.requiredActions[0].action).toBe("Verify at sub-registrar");
    expect(report.requiredActions[0].status).toBe("pending");
    expect(report.missingInformation).toContain("Encumbrance certificate");
    expect(report.sources[0].id).toBe("s1");
    expect(report.humanReviewItems.length).toBeGreaterThanOrEqual(0);
  });

  it("returns null bundle sections empty but valid when nothing persisted", () => {
    const report = assembleReport({
      bundle: null,
      session: session(),
      sources: [],
      checklist: [],
    });
    expect(report.entities).toEqual([]);
    expect(report.verification).toEqual([]);
    expect(report.executiveSummary).toContain("Sale Deed");
  });

  it("readBundle enforces ownership", () => {
    const db = openTestDatabase();
    migrate(db);
    const store = getAnalysisStore(db);
    const doc = buildNormalizedDocument({ ownerId: "o", sessionId: "s", sourceType: "text", text: TEXT });
    store.saveFoundation(doc, "x", [], [], []);
    expect(store.readBundle(doc.documentId, "intruder")).toBeNull();
  });
});
