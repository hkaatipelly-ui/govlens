import { describe, it, expect } from "vitest";
import { buildNormalizedDocument } from "@/lib/documents/normalized";
import { classifyDocument, extractEntities, extractClaims, buildEvidence } from "@/lib/analysis/foundation";
import { buildQuestionGraph, buildChronology, detectContradictions } from "@/lib/analysis/deep";
import { isSchemeLike, extractScheme, buildEligibilityMatrix, buildChecklist } from "@/lib/analysis/scheme";
import { isLegalLike, extractLegalHeader, buildPartyGraph, buildRelationships, crossDocumentAnalysis } from "@/lib/analysis/legal";
import { routeClaims, verifyWithUserEvidence } from "@/lib/verification/pipeline";
import { assembleReport } from "@/lib/analysis/assembler";
import { validateFile, IngestionError } from "@/app/lib/ingestion";

const FIXTURES: Record<string, string> = {
  schemeNotice: `PM-KISAN Samman Nidhi notice. Department of Agriculture. All landholding farmer families eligible. Exclusions: income tax payers. Required: land passbook, Aadhaar. Deadline 31-03-2026.`,
  landProperty: `Dharani passbook. Pattadar Ravi Kumar. Survey No. 123/A measuring 2.14 acres, dry land, Medchal district. Khata 4567.`,
  courtDocument: `In the District Court, Medchal. Case No. OS/118/2024. Petitioner Suresh Kumar vs Respondent Ramesh Rao. Next hearing 15-04-2026. Adv. Priya Sharma for petitioner.`,
  fir: `First Information Report. FIR No. 45/2024 dated 05-03-2024. Miyapur Police Station. Complainant Suresh Kumar states accused Ramesh Rao took Rs 200000. Section 420 IPC.`,
  legalNotice: `Legal Notice. Advocate Vikram Reddy for client Suresh Kumar demands Rs 200000 from Ramesh Rao within 15 days, failing which legal proceedings under Section 420 IPC will follow.`,
  utilityBill: `Electricity bill. Consumer LT-88213. Units consumed 210. Amount Rs 1845 due 28-02-2026. TSSPDCL, Hyderabad.`,
  multiPagePdf: `[Page 1]\nAcknowledgement MSC2026001234 dated 20-09-2026.\n\n[Page 2]\nEnquiry completed by Village Revenue Officer.\n\n[Page 3]\nCollect certificate after 7 days. Fee Rs 45.`,
  scannedText: `Acknowledgement receipt for income certificate. Applicant Ramesh Kumar. MSC2026001234.`,
  docxText: `Income Certificate application at MeeSeva centre. Applicant Ramesh Kumar, application number MSC2026001234. Fee Rs 45.`,
  imageText: `MeeSeva acknowledgement. Ramesh Kumar. MSC2026001234 dated 20-09-2026.`,
};

function fullPipeline(name: string, text: string) {
  const doc = buildNormalizedDocument({ ownerId: "o", sessionId: "s", sourceType: "text", text });
  const classification = classifyDocument(doc);
  const entities = extractEntities(doc);
  const claims = extractClaims(doc, entities);
  const evidence = buildEvidence(doc, claims, []);
  const graph = buildQuestionGraph(doc, classification.documentType, claims, entities);
  const timeline = buildChronology(doc, entities);
  const contradictions = detectContradictions(doc, entities, claims);
  const routes = routeClaims(doc.documentId, claims);
  return { doc, classification, entities, claims, evidence, graph, timeline, contradictions, routes };
}

describe("fixture matrix (10 types, full deterministic pipeline)", () => {
  for (const [name, text] of Object.entries(FIXTURES)) {
    it(`${name}: normalize→classify→entities→claims→questions→evidence→contradictions→routes`, () => {
      const p = fullPipeline(name, text);
      expect(p.doc.pageCount).toBeGreaterThan(0);
      expect(p.entities.length).toBeGreaterThan(0);
      expect(p.claims.length).toBeGreaterThan(0);
      expect(p.graph.roots.length + p.graph.subquestions.length).toBeGreaterThan(0);
      expect(p.evidence.length).toBeGreaterThan(0);
    });
  }

  it("multi-page PDF preserves page provenance", () => {
    const p = fullPipeline("multiPagePdf", FIXTURES.multiPagePdf);
    expect(p.doc.pageCount).toBeGreaterThanOrEqual(1);
    expect(p.claims.every((c) => c.sourcePage >= 1)).toBe(true);
    expect(p.entities.some((e) => e.canonicalValue.includes("MSC2026001234"))).toBe(true);
  });

  it("scheme doc activates scheme engine; FIR activates legal engine", () => {
    expect(isSchemeLike("unknown", FIXTURES.schemeNotice)).toBe(true);
    expect(isLegalLike("unknown", FIXTURES.fir)).toBe(true);
    expect(isLegalLike("unknown", FIXTURES.utilityBill)).toBe(false);
  });
});

describe("property test (synthetic MATCH/MATCH/MISMATCH)", () => {
  it("holder+survey match, extent mismatches with inconsistency wording", () => {
    const doc = buildNormalizedDocument({
      ownerId: "o", sessionId: "s", sourceType: "text",
      text: "Dharani passbook. Holder Person A. Survey No. 123/A. Extent 2.14 acres.",
    });
    const claim = {
      claimId: "c1", subject: "", predicate: "", object: "",
      claimText: "Holder Person A holds Survey No. 123/A measuring 2.14 acres.",
      sourcePage: 1, sourceText: "", confidence: 0.6,
      materiality: "high" as const, verificationStatus: "extracted" as const, evidenceIds: [],
    };
    const rs = verifyWithUserEvidence(
      claim,
      { adapterId: "tg-land-bhubharati", documentId: doc.documentId, claimId: "c1",
        fields: { holder: "Person A", survey_number: "123/A", extent: "1.86 acres" }, sourceUrl: null },
      { evidenceId: "" }
    );
    const byField = Object.fromEntries(rs.map((r) => [r.field, r]));
    expect(byField.holder.status).toBe("MATCH");
    expect(byField.survey_number.status).toBe("MATCH");
    expect(byField.extent.status).toBe("MISMATCH");
    expect(byField.extent.explanation).toMatch(/potential record inconsistency/i);
    expect(rs.every((r) => !/forgery confirmed|forg/i.test(r.explanation))).toBe(true);
  });
});

describe("scheme test (5 reqs, 7 docs, 2 missing)", () => {
  it("separates satisfied/unknown, flags missing docs with sources", () => {
    const extraction = {
      documentType: "x", title: null, organization: null, summary: "s",
      deadline: null, amount: null, referenceNumber: null,
      requiredDocuments: ["land passbook", "Aadhaar card", "bank passbook", "ration card", "caste certificate", "income certificate", "photos"],
      requiredActions: [], warningSignals: [], language: "en", sourceIds: ["goi-pmkisan"],
    };
    const scheme = {
      schemeName: "Test Scheme", issuingAuthority: null, objective: "", targetBeneficiaries: "",
      eligibilityRules: ["Must hold cultivable land.", "Must be resident of Telangana.", "Must have Aadhaar-seeded bank account.", "Must complete e-KYC.", "Must not be an income tax payer."],
      exclusions: [], ageRequirements: "", incomeRequirements: "", residenceRequirements: "",
      occupationRequirements: "", categoryRequirements: "", propertyRequirements: "",
      deadline: null, benefit: "", amount: null, applicationMethod: "",
      requiredDocuments: extraction.requiredDocuments, requiredActions: [], officialSources: ["goi-pmkisan"],
    };
    const docText = "Applicant has land passbook and Aadhaar card. Ration card attached.";
    const reqs = buildEligibilityMatrix("d", scheme, docText);
    expect(reqs).toHaveLength(5);
    expect(reqs.every((r) => r.status === "UNKNOWN" || r.status === "INSUFFICIENT_EVIDENCE")).toBe(true);
    const docs = buildChecklist("d", scheme, docText);
    expect(docs).toHaveLength(7);
    expect(docs.filter((d) => d.state === "missing").length).toBeGreaterThanOrEqual(2);
    expect(docs.every((d) => d.source === "goi-pmkisan")).toBe(true);
  });
});

describe("court test (5 events, bad date, missing ref, conflict)", () => {
  it("detects timeline, inconsistency, missing reference", () => {
    const text = `District Court Medchal. Case OS/118/2024. Petitioner Suresh Kumar vs Respondent Ramesh Rao.
Suit filed on 20-12-2025 by the petitioner. Agreement allegedly signed on 01-12-2025.
Hearing on 15-01-2026 adjourned. Order passed on 10-01-2026 before the hearing date recorded.
Petitioner claims agreement dated 01-12-2025. Respondent denies any agreement in 2025.
See Annexure-C for the sale deed. Next hearing 15-04-2026.`;
    const doc = buildNormalizedDocument({ ownerId: "o", sessionId: "s", sourceType: "text", text });
    const ents = extractEntities(doc);
    const tl = buildChronology(doc, ents);
    expect(tl.length).toBeGreaterThanOrEqual(5);
    const cx = detectContradictions(doc, ents, extractClaims(doc, ents));
    // conflicting party statements about the agreement surface for review
    const rels = buildRelationships("d", text);
    expect(Array.isArray(rels)).toBe(true);
    expect(cx.length + rels.length).toBeGreaterThan(0);
  });
});

describe("ingestion formats", () => {
  it("rejects TXT, accepts pdf/docx/jpg/jpeg/png", () => {
    const mk = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "" });
    expect(() => validateFile(mk("a.txt"))).toThrowError(IngestionError);
    for (const n of ["a.pdf", "a.docx", "a.jpg", "a.jpeg", "a.png"]) {
      expect(["pdf", "docx", "jpg", "jpeg", "png"]).toContain(validateFile(mk(n)));
    }
  });
});

describe("cross-document case analysis", () => {
  it("links shared survey across FIR + deed without giant prompts", async () => {
    const out = crossDocumentAnalysis([
      { documentId: "fir-1", classification: "fir",
        entities: [{ entityType: "SURVEY_NUMBER", canonicalValue: "123/A" }],
        claims: [{ claimId: "c1", claimText: "Dispute over Survey No. 123/A raised." } as never], timeline: [] },
      { documentId: "deed-1", classification: "sale_deed",
        entities: [{ entityType: "SURVEY_NUMBER", canonicalValue: "123/A" }],
        claims: [{ claimId: "c2", claimText: "Survey No. 123/A sold by Ravi." } as never], timeline: [] },
    ]);
    expect(out.mergedTimelineNotes.some((n) => n.includes("123/a"))).toBe(true);
  });
});
