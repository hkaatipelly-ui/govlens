import { describe, it, expect } from "vitest";
import { buildNormalizedDocument } from "@/lib/documents/normalized";
import {
  classifyDocument,
  extractEntities,
  extractClaims,
  buildEvidence,
} from "@/lib/analysis/foundation";
import { getAnalysisStore } from "@/lib/analysis/store";
import { openTestDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";

const GOV_TEXT = `Acknowledgement receipt: Income Certificate application at MeeSeva centre.
Applicant Ramesh Kumar, application number MSC2026001234 dated 20-09-2026.
Fee Rs 45 paid. Survey No. 123/A, Khata 4567. Contact 9876543210.`;

function govDoc(ownerId = "owner-a") {
  return buildNormalizedDocument({
    ownerId,
    sessionId: "sess-1",
    sourceType: "text",
    language: "en",
    text: GOV_TEXT,
  });
}

describe("normalized document", () => {
  it("builds pages/blocks with provenance", () => {
    const doc = govDoc();
    expect(doc.pageCount).toBe(1);
    expect(doc.pages[0].blocks.length).toBeGreaterThan(0);
    expect(doc.pages[0].blocks[0].pageNumber).toBe(1);
    expect(doc.ownerId).toBe("owner-a");
    expect(doc.extractedText).toContain("MSC2026001234");
  });
});

describe("classification", () => {
  it("classifies a MeeSeva acknowledgement without claiming authenticity", () => {
    const c = classifyDocument(govDoc());
    expect(c.detectedDocumentNumber).toContain("MSC2026001234");
    expect(c.detectedDates).toContain("20-09-2026");
    expect(c.note).toMatch(/not independently verified/i);
    expect(c.classificationConfidence).toBeGreaterThan(0);
  });

  it("marks unknown content uncertain", () => {
    const c = classifyDocument(
      buildNormalizedDocument({ ownerId: "o", sessionId: "s", sourceType: "text", text: "hello world nice day" })
    );
    expect(c.documentType).toBe("unknown");
  });
});

describe("entities and claims", () => {
  it("extracts dated/money/survey/phone/ref entities with page refs", () => {
    const doc = govDoc();
    const ents = extractEntities(doc);
    const types = ents.map((e) => e.entityType);
    expect(types).toContain("DATE");
    expect(types).toContain("MONEY");
    expect(types).toContain("SURVEY_NUMBER");
    expect(types).toContain("PHONE");
    expect(types).toContain("REFERENCE_NUMBER");
    expect(ents.every((e) => e.pageNumber === 1 && e.textSpan.length > 0)).toBe(true);
  });

  it("extracts sentence claims as extracted (never facts)", () => {
    const doc = govDoc();
    const claims = extractClaims(doc, extractEntities(doc));
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every((c) => c.verificationStatus === "extracted")).toBe(true);
    expect(claims.every((c) => c.sourcePage === 1)).toBe(true);
  });

  it("builds document + official evidence objects", () => {
    const doc = govDoc();
    const ev = buildEvidence(doc, extractClaims(doc, []), [
      { documentId: "tg-meeseva-income-cert", title: "Income Cert", state: "Telangana", sourceUrl: "https://x", content: "Required documents: Aadhaar." },
    ]);
    expect(ev.some((e) => e.sourceType === "document_text")).toBe(true);
    expect(ev.some((e) => e.sourceType === "official_document")).toBe(true);
  });
});

describe("analysis store isolation", () => {
  it("persists owner-scoped rows; other owners see zero", () => {
    const db = openTestDatabase();
    migrate(db);
    const store = getAnalysisStore(db);
    const doc = govDoc("owner-a");
    const ents = extractEntities(doc);
    const claims = extractClaims(doc, ents);
    const ev = buildEvidence(doc, claims, []);
    const saved = store.saveFoundation(doc, "government_notice", ents, claims, ev);
    expect(saved.entities).toBe(ents.length);
    const mine = store.countsForSession("sess-1", "owner-a");
    expect(mine.entities).toBe(ents.length);
    expect(mine.claims).toBe(claims.length);
    const other = store.countsForSession("sess-1", "owner-b");
    expect(other).toEqual({ entities: 0, claims: 0, evidence: 0, pages: 0 });
  });
});
