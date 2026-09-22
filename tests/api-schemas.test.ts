import { describe, it, expect } from "vitest";
import {
  analyzeRequestSchema,
  askRequestSchema,
  translateRequestSchema,
  createCaseRequestSchema,
  updateCaseRequestSchema,
} from "@/lib/validation/apiSchemas";

describe("API request validation", () => {
  it("analyze requires non-empty text (OCR-empty guard)", () => {
    expect(analyzeRequestSchema.safeParse({ text: "  " }).success).toBe(false);
    expect(analyzeRequestSchema.safeParse({ text: "ack receipt" }).success).toBe(true);
  });

  it("extracted text has NO application character ceiling", () => {
    const big = "Acknowledgement receipt. ".repeat(1200); // ~30,000 chars
    expect(big.length).toBeGreaterThan(25000);
    expect(analyzeRequestSchema.safeParse({ text: big }).success).toBe(true);
    expect(askRequestSchema.safeParse({ question: "q", documentText: big }).success).toBe(true);
  });

  it("analyze accepts large payloads (no application text ceiling)", () => {
    expect(analyzeRequestSchema.safeParse({ text: "x".repeat(20001) }).success).toBe(true);
  });

  it("ask requires a question", () => {
    expect(askRequestSchema.safeParse({ question: "" }).success).toBe(false);
    expect(
      askRequestSchema.safeParse({ sessionId: "s1", question: "deadline?", language: "te" }).success
    ).toBe(true);
  });

  it("translate only allows en/te", () => {
    expect(translateRequestSchema.safeParse({ text: "hi", targetLanguage: "hi" }).success).toBe(false);
    expect(translateRequestSchema.safeParse({ text: "hi", targetLanguage: "te" }).success).toBe(true);
  });

  it("case creation needs sessionId or nothing-but-valid (shape check)", () => {
    expect(createCaseRequestSchema.safeParse({}).success).toBe(true);
    expect(createCaseRequestSchema.safeParse({ sessionId: "abc" }).success).toBe(true);
  });

  it("case status updates only allow known statuses", () => {
    expect(updateCaseRequestSchema.safeParse({ status: "archived" }).success).toBe(false);
    for (const s of ["open", "needs_review", "completed"]) {
      expect(updateCaseRequestSchema.safeParse({ status: s }).success).toBe(true);
    }
  });
});
