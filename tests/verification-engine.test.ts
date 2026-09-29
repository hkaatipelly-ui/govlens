import { describe, it, expect } from "vitest";
import {
  adaptersFor,
  compareField,
  listAdapters,
} from "@/lib/verification/adapters";
import {
  ensureAdapters,
  identifyVerifiableClaims,
  routeClaims,
  verifyWithUserEvidence,
} from "@/lib/verification/pipeline";
import { getVerificationStore } from "@/lib/verification/store";
import { openTestDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import type { Claim } from "@/lib/analysis/schemas";

function claim(text: string, id = "c1"): Claim {
  return {
    claimId: id,
    subject: "",
    predicate: "",
    object: "",
    claimText: text,
    sourcePage: 1,
    sourceText: text,
    confidence: 0.6,
    materiality: "high",
    verificationStatus: "extracted",
    evidenceIds: [],
  };
}

const ids = { resultId: "r1", sourceId: "tg-land-bhubharati", evidenceId: "e1", claimId: "c1" };
const src = { sourceUrl: "https://bhubharati.telangana.gov.in", sourceType: "user_provided" as const };

describe("comparison (trust boundary wording)", () => {
  it("MATCH on equal values", () => {
    const r = compareField("holder", "Ravi Kumar", "ravi kumar", ids, src);
    expect(r.status).toBe("MATCH");
    expect(r.comparison).toBe("equal");
  });

  it("MISMATCH with inconsistency wording, never forgery claims", () => {
    const r = compareField("extent", "2.14 acres", "1.86 acres", ids, src);
    expect(r.status).toBe("MISMATCH");
    expect(r.explanation).toMatch(/potential record inconsistency/i);
    expect(r.explanation).toMatch(/further verification is required/i);
    expect(r.explanation).not.toMatch(/forg|fraud|fake|scam/i);
    expect(r.humanReviewRequired).toBe(true);
  });

  it("missing external value → UNABLE_TO_VERIFY", () => {
    const r = compareField("holder", "Ravi Kumar", "", ids, src);
    expect(r.status).toBe("UNABLE_TO_VERIFY");
  });

  it("close numeric values → PARTIAL_MATCH", () => {
    const r = compareField("amount", "Rs 45000", "Rs 46000", ids, src);
    expect(r.status).toBe("PARTIAL_MATCH");
  });
});

describe("adapter routing", () => {
  it("land claims route to the Bhu Bharati adapter with lookup fields", () => {
    ensureAdapters();
    expect(listAdapters().length).toBeGreaterThanOrEqual(4);
    const c = claim("Person A is the holder of Survey No. 123/A measuring 2 acres.");
    const found = adaptersFor(c);
    expect(found.map((a) => a.adapterId)).toContain("tg-land-bhubharati");
    const lookup = found[0].buildLookupRequest(c, "doc-1");
    expect(lookup).not.toBeNull();
    expect(lookup!.automated).toBe(false);
    expect(lookup!.sourceUrl).toContain("http");
    expect(Object.keys(lookup!.fields)).toContain("survey_number");
  });

  it("FIR claims route to eCourts adapter", () => {
    const c = claim("FIR No. 45/2024 was registered at Miyapur Police Station.");
    expect(adaptersFor(c).map((a) => a.adapterId)).toContain("in-ecourts");
  });

  it("private content routes nowhere", () => {
    const c = claim("Hi team, quarterly sales report attached.", "c9");
    expect(adaptersFor(c)).toEqual([]);
  });
});

describe("pipeline + store isolation", () => {
  it("identifies verifiable claims and routes them", () => {
    const routes = routeClaims("doc-1", [
      claim("Holder Ravi Kumar, Survey No. 123/A."),
      claim("Nice weather today.", "c2"),
    ]);
    expect(routes.length).toBeGreaterThanOrEqual(1);
    expect(routes[0].lookups.length).toBeGreaterThan(0);
  });

  it("user evidence compares and persists owner-scoped", () => {
    const db = openTestDatabase();
    migrate(db);
    const store = getVerificationStore(db);
    const c = claim("Holder is Ravi Kumar. Survey No. 123/A.");
    const results = verifyWithUserEvidence(
      c,
      { adapterId: "tg-land-bhubharati", documentId: "doc-1", claimId: "c1", fields: { holder: "Ravi Kumar" }, sourceUrl: null },
      { evidenceId: "" }
    );
    expect(results.some((r) => r.status === "MATCH")).toBe(true);
    expect(store.saveResults("owner-a", "doc-1", results)).toBe(results.length);
    expect(store.resultsForDocument("doc-1", "owner-a").length).toBe(results.length);
    expect(store.resultsForDocument("doc-1", "owner-b")).toEqual([]);
  });

  it("unknown adapter → CHECK_NOT_AVAILABLE, never throws", () => {
    const results = verifyWithUserEvidence(
      claim("Something."),
      { adapterId: "nope", documentId: "d", claimId: "", fields: {}, sourceUrl: null },
      { evidenceId: "" }
    );
    expect(results[0].status).toBe("CHECK_NOT_AVAILABLE");
  });
});
