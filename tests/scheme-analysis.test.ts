import { describe, it, expect } from "vitest";
import {
  isSchemeLike,
  extractScheme,
  buildEligibilityMatrix,
  buildChecklist,
  buildSchemeQuestions,
} from "@/lib/analysis/scheme";
import { getAnalysisStore } from "@/lib/analysis/store";
import { openTestDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import type { DocumentExtraction } from "@/lib/extraction/schemas";
import type { KnowledgeHit } from "@/lib/knowledge/KnowledgeEngine";

const PMKISAN_TEXT = `PM-KISAN Samman Nidhi. Department of Agriculture and Farmers Welfare.
All landholding farmer families with cultivable land are eligible.
Exclusions: institutional landholders, serving government employees, income tax payers.
Required documents: land passbook, Aadhaar card, bank account details. e-KYC is mandatory.`;

function extraction(): DocumentExtraction {
  return {
    documentType: "Scheme notice",
    title: null,
    organization: "Department of Agriculture and Farmers Welfare",
    summary: "PM-KISAN income support.",
    deadline: null,
    amount: "Rs 6000",
    referenceNumber: null,
    requiredDocuments: ["land passbook", "Aadhaar card", "bank account details"],
    requiredActions: ["Complete e-KYC"],
    warningSignals: [],
    language: "en",
    sourceIds: ["goi-pmkisan"],
  };
}

function hit(): KnowledgeHit {
  return {
    chunkId: "goi-pmkisan#0",
    documentId: "goi-pmkisan",
    content: PMKISAN_TEXT,
    sourceMetadata: {
      id: "goi-pmkisan", title: "PM-KISAN", department: "Agriculture",
      state: "All India", documentType: "scheme", language: "en",
      sourceUrl: "https://pmkisan.gov.in", publishedDate: "2024-05-01",
      effectiveDate: "2024-05-01", lastVerified: "2026-09-01",
    },
    score: 10,
    matchedTerms: ["pm-kisan"],
  };
}

describe("scheme activation", () => {
  it("activates for scheme classifications and scheme text", () => {
    expect(isSchemeLike("government_scheme", "anything")).toBe(true);
    expect(isSchemeLike("unknown", PMKISAN_TEXT)).toBe(true);
    expect(isSchemeLike("unknown", "DMart receipt total Rs 555")).toBe(false);
  });
});

describe("scheme extraction (grounded only)", () => {
  it("extracts name, rules, exclusions, docs from evidence", () => {
    const s = extractScheme(PMKISAN_TEXT, extraction(), [hit()]);
    expect(s.schemeName).toMatch(/PM-KISAN/i);
    expect(s.issuingAuthority).toContain("Agriculture");
    expect(s.exclusions.length).toBeGreaterThan(0);
    expect(s.requiredDocuments).toContain("land passbook");
    expect(s.officialSources).toContain("goi-pmkisan");
    expect(s.amount).toBe("Rs 6000");
  });

  it("invents nothing when evidence is empty", () => {
    const s = extractScheme("hello world", extraction(), []);
    expect(s.schemeName).toBeNull();
    expect(s.eligibilityRules).toEqual([]);
    expect(s.requiredDocuments).toEqual(extraction().requiredDocuments);
  });
});

describe("eligibility matrix", () => {
  it("never converts UNKNOWN to NOT_SATISFIED", () => {
    const s = extractScheme(PMKISAN_TEXT, extraction(), [hit()]);
    const reqs = buildEligibilityMatrix("doc-1", s, PMKISAN_TEXT);
    expect(reqs.length).toBeGreaterThan(0);
    expect(reqs.every((r) => ["SATISFIED", "NOT_SATISFIED", "UNKNOWN", "INSUFFICIENT_EVIDENCE", "NOT_APPLICABLE"].includes(r.status))).toBe(true);
    // No document evidence of meeting criteria → UNKNOWN-family only
    expect(reqs.every((r) => r.status === "UNKNOWN" || r.status === "INSUFFICIENT_EVIDENCE")).toBe(true);
    expect(reqs.every((r) => r.explanation.length > 0)).toBe(true);
  });
});

describe("checklist states", () => {
  it("marks provided/incomplete/missing from document text", () => {
    const s = extractScheme(PMKISAN_TEXT, extraction(), [hit()]);
    const docs = buildChecklist("doc-1", s, "Applicant has land passbook and Aadhaar card ready.");
    const states = Object.fromEntries(docs.map((d) => [d.documentName, d.state]));
    expect(states["land passbook"]).toBe("provided");
    expect(states["bank account details"]).toBe("missing");
    expect(docs.every((d) => d.whyRequired.length > 0 && d.source.length > 0)).toBe(true);
  });
});

describe("scheme questions", () => {
  it("generates 10 rule questions per requirement", () => {
    const s = extractScheme(PMKISAN_TEXT, extraction(), [hit()]);
    const reqs = buildEligibilityMatrix("doc-1", s, PMKISAN_TEXT);
    const qs = buildSchemeQuestions("doc-1", reqs.slice(0, 1));
    expect(qs).toHaveLength(10);
    expect(qs[0].question).toContain("What exactly is the rule?");
  });
});

describe("scheme store isolation", () => {
  it("persists owner-scoped reports; others see nothing", () => {
    const db = openTestDatabase();
    migrate(db);
    const store = getAnalysisStore(db);
    const s = extractScheme(PMKISAN_TEXT, extraction(), [hit()]);
    const bundle = store.saveScheme(
      "doc-1", "sess-1", "owner-a", s,
      buildEligibilityMatrix("doc-1", s, PMKISAN_TEXT),
      buildChecklist("doc-1", s, PMKISAN_TEXT)
    );
    expect(bundle.schemeName).toMatch(/PM-KISAN/i);
    expect(bundle.requirements).toBeGreaterThan(0);
    expect(bundle.unknown).toBe(bundle.requirements); // nothing satisfied without user evidence
    const rows = db.prepare(`SELECT COUNT(*) AS n FROM scheme_reports WHERE owner_id = ?`).get("owner-b");
    expect((rows as { n: number }).n).toBe(0);
  });
});
