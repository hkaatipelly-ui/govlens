import { describe, it, expect } from "vitest";
import { buildNormalizedDocument } from "@/lib/documents/normalized";
import { extractClaims } from "@/lib/analysis/foundation";
import {
  isLegalLike,
  extractLegalHeader,
  buildPartyGraph,
  extractProvisions,
  buildClaimEvidenceMatrix,
  buildRelationships,
  crossDocumentAnalysis,
} from "@/lib/analysis/legal";
import { getLegalStore } from "@/lib/analysis/legal-store";
import { openTestDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";

const FIR_TEXT = `First Information Report. FIR No. 45/2024 dated 05-03-2024.
Miyapur Police Station. Complainant Suresh Kumar states that accused Ramesh Rao
took Rs 200000. Offence under Section 420 IPC. Witness Anil Kumar. Adv. Priya Sharma for complainant.`;

function firDoc() {
  return buildNormalizedDocument({ ownerId: "o", sessionId: "s", sourceType: "text", text: FIR_TEXT });
}

describe("legal activation", () => {
  it("activates for FIR classifications and legal text", () => {
    expect(isLegalLike("fir", "anything")).toBe(true);
    expect(isLegalLike("unknown", FIR_TEXT)).toBe(true);
    expect(isLegalLike("unknown", "DMart receipt total Rs 555")).toBe(false);
  });
});

describe("case header", () => {
  it("extracts FIR identifiers, parties, sections verbatim", () => {
    const h = extractLegalHeader(FIR_TEXT);
    expect(h.firNumber).toContain("45/2024");
    expect(h.policeStation).toContain("Miyapur Police Station");
    expect(h.sections.join(" ")).toContain("420");
    expect(h.dates).toContain("05-03-2024");
  });
});

describe("party graph (no role inference from bare names)", () => {
  it("assigns roles only from explicit role language", () => {
    const parties = buildPartyGraph("doc-1", FIR_TEXT, []);
    const byName = Object.fromEntries(parties.map((p) => [p.name, p.role]));
    expect(byName["Suresh Kumar"]).toBe("complainant");
    expect(byName["Ramesh Rao"]).toBe("accused");
    expect(byName["Anil Kumar"]).toBe("witness");
    expect(byName["Priya Sharma"]).toBe("advocate");
    // A bare name with no role words nearby gets no fabricated role entry
    expect(parties.every((p) => p.roleEvidence.length > 0)).toBe(true);
  });
});

describe("provisions and relationships", () => {
  it("extracts exact provision references with pages", () => {
    const provs = extractProvisions(firDoc());
    expect(provs.some((p) => p.kind === "section" && /420/.test(p.reference))).toBe(true);
    expect(provs.every((p) => p.pageNumber === 1)).toBe(true);
  });

  it("detects document references", () => {
    const rels = buildRelationships("doc-1", "As per Annexure-A and Exhibit P1 enclosed herewith.");
    expect(rels.length).toBeGreaterThan(0);
    expect(rels.some((r) => r.relation === "references")).toBe(true);
  });
});

describe("claim/evidence matrix", () => {
  it("marks contradicted claims for human review", () => {
    const claims = extractClaims(firDoc(), []);
    const matrix = buildClaimEvidenceMatrix(claims.slice(0, 2), [
      {
        contradictionId: "cx-1", category: "date", claimA: claims[0].claimText,
        claimB: "other", evidenceA: "", evidenceB: "", severity: "material",
        explanation: "x", verificationRequired: "y",
      },
    ]);
    expect(matrix[0].status).toBe("requires_human_review");
    expect(matrix[1].status).toBe("unresolved");
  });
});

describe("cross-document analysis (no giant prompt)", () => {
  it("notes shared entities and flags survey divergence", () => {
    const out = crossDocumentAnalysis([
      {
        documentId: "d1", classification: "sale_deed",
        entities: [{ entityType: "SURVEY_NUMBER", canonicalValue: "123/A" }],
        claims: [{ claimId: "c1", claimText: "Survey No. 123/A sold by Ravi." } as never],
        timeline: [],
      },
      {
        documentId: "d2", classification: "sale_deed",
        entities: [{ entityType: "SURVEY_NUMBER", canonicalValue: "123/A" }],
        claims: [{ claimId: "c2", claimText: "Survey No. 123/A mortgaged by Ravi." } as never],
        timeline: [],
      },
    ]);
    expect(out.mergedTimelineNotes.some((n) => n.includes("123/a"))).toBe(true);
    expect(out.crossContradictions.length).toBeGreaterThan(0);
    expect(out.crossContradictions[0].explanation).toMatch(/potential inconsistency/i);
  });

  it("single document yields empty cross-doc output", () => {
    expect(crossDocumentAnalysis([]).crossContradictions).toEqual([]);
  });
});

describe("legal store isolation", () => {
  it("persists owner-scoped legal rows + session bundle", () => {
    const db = openTestDatabase();
    migrate(db);
    const store = getLegalStore(db);
    const saved = store.saveLegal(
      "doc-1", "owner-a", extractLegalHeader(FIR_TEXT),
      buildPartyGraph("doc-1", FIR_TEXT, []), extractProvisions(firDoc()),
      buildRelationships("doc-1", FIR_TEXT)
    );
    expect(saved.parties).toBeGreaterThan(0);
    const bundle = store.attachToSessionBundle("sess-1", "doc-1", "owner-a", "FIR file");
    expect(store.bundleDocuments(bundle, "owner-a")).toHaveLength(1);
    expect(store.bundleDocuments(bundle, "owner-b")).toEqual([]);
    const rows = db.prepare(`SELECT COUNT(*) AS n FROM parties WHERE owner_id = ?`).get("owner-b");
    expect((rows as { n: number }).n).toBe(0);
  });
});
