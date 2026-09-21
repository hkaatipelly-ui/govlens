import { describe, it, expect } from "vitest";
import { fillExtractionGaps, ensureExplanation } from "@/lib/extraction/postprocess";
import type { DocumentExtraction } from "@/lib/extraction/schemas";
import type { Explanation } from "@/lib/verification/schemas";

function base(): DocumentExtraction {
  return {
    documentType: "Acknowledgement receipt",
    title: null,
    organization: null,
    summary: "An acknowledgement.",
    deadline: null,
    amount: null,
    referenceNumber: null,
    requiredDocuments: ["Aadhaar card"],
    requiredActions: ["Visit counter"],
    warningSignals: [],
    language: "en",
    sourceIds: [],
  };
}

describe("fillExtractionGaps (verbatim only)", () => {
  it("copies reference, amount and deadline substrings from the document", () => {
    const doc =
      "application number MSC2026001234 dated 20-09-2026. Fee Rs 45 paid. collect certificate after 7 days.";
    const out = fillExtractionGaps(base(), doc);
    expect(out.referenceNumber).toContain("MSC2026001234");
    expect(out.amount).toContain("45");
    expect(out.deadline).toMatch(/7 days/);
  });

  it("never overwrites model values and never invents", () => {
    const filled = { ...base(), referenceNumber: "MODEL-1", deadline: "d", amount: "a" };
    expect(fillExtractionGaps(filled, "nothing here xyz").referenceNumber).toBe("MODEL-1");
    const empty = fillExtractionGaps(base(), "nothing matching here at all");
    expect(empty.referenceNumber).toBeNull();
    expect(empty.amount).toBeNull();
    expect(empty.deadline).toBeNull();
  });
});

describe("ensureExplanation", () => {
  it("derives points from extraction when the model is terse", () => {
    const thin: Explanation = {
      summary: "s",
      importantPoints: [],
      whatToDo: [],
      deadline: "",
      amount: "",
      verificationNote: "",
      sourceIds: [],
    };
    const out = ensureExplanation(thin, { ...base(), deadline: "7 days" }, ["src-1"]);
    expect(out.importantPoints.length).toBeGreaterThan(0);
    expect(out.whatToDo).toEqual(["Visit counter"]);
    expect(out.deadline).toBe("7 days");
    expect(out.sourceIds).toEqual(["src-1"]);
    expect(out.verificationNote.length).toBeGreaterThan(0);
  });
});
