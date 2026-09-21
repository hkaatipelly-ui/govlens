import { describe, it, expect } from "vitest";
import {
  validateExtractionJson,
  unverifiedExtractionFallback,
  safeJsonParse,
} from "@/lib/extraction/schemas";

const VALID = JSON.stringify({
  documentType: "Income Certificate",
  title: "Acknowledgement",
  organization: "Revenue Department",
  summary: "An acknowledgement for an income certificate application.",
  summaryTelugu: "ఆదాయ ధృవీకరణ దరఖాస్తు రసీదు.",
  deadline: "7 days",
  amount: "Rs 45",
  referenceNumber: "MSC2026001234",
  requiredDocuments: ["Aadhaar card"],
  requiredActions: ["Visit MeeSeva centre"],
  warningSignals: [],
  language: "en",
  sourceIds: ["tg-meeseva-income-cert"],
});

describe("extraction validation", () => {
  it("accepts a valid model payload", () => {
    const out = validateExtractionJson(VALID);
    expect(out).not.toBeNull();
    expect(out!.documentType).toBe("Income Certificate");
    expect(out!.referenceNumber).toBe("MSC2026001234");
    expect(out!.sourceIds).toEqual(["tg-meeseva-income-cert"]);
  });

  it("accepts fenced JSON", () => {
    expect(validateExtractionJson("```json\n" + VALID + "\n```")).not.toBeNull();
  });

  it("rejects malformed JSON without throwing", () => {
    expect(validateExtractionJson("not json at all {{{")).toBeNull();
    expect(validateExtractionJson('{"documentType": 42}')).toBeNull();
  });

  it("rejects missing summary (hallucination guard)", () => {
    const noSummary = JSON.stringify({ documentType: "X", summary: "  " });
    expect(validateExtractionJson(noSummary)).toBeNull();
  });

  it("fallback invents no facts", () => {
    const f = unverifiedExtractionFallback("en");
    expect(f.deadline).toBeNull();
    expect(f.amount).toBeNull();
    expect(f.requiredDocuments).toEqual([]);
    expect(f.summary).toContain("could not verify");
  });

  it("safeJsonParse never throws", () => {
    expect(safeJsonParse("{{{bad")).toBeNull();
  });
});
