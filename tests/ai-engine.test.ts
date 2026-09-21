import { describe, it, expect, vi, afterEach } from "vitest";
import {
  OllamaGemmaEngine,
  buildAnalysisPrompt,
  buildQuestionPrompt,
  AIEngineUnavailableError,
  ASK_FALLBACK,
} from "@/lib/ai/OllamaGemmaEngine";
import type { KnowledgeHit } from "@/lib/knowledge/KnowledgeEngine";

const HIT: KnowledgeHit = {
  chunkId: "tg-meeseva-income-cert#0",
  documentId: "tg-meeseva-income-cert",
  content: "Required documents: Aadhaar card, ration card.",
  sourceMetadata: {
    id: "tg-meeseva-income-cert",
    title: "Income Certificate via MeeSeva",
    department: "Revenue Department, Government of Telangana",
    state: "Telangana",
    documentType: "certificate-procedure",
    language: "en",
    sourceUrl: "https://www.telangana.gov.in",
    publishedDate: "2024-06-01",
    effectiveDate: "2024-06-01",
    lastVerified: "2026-09-01",
  },
  score: 9,
  matchedTerms: ["income"],
};

function mockChat(content: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ message: { content } }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prompt construction", () => {
  it("analysis prompt carries document + evidence + source ids", () => {
    const p = buildAnalysisPrompt("Acknowledgement MSC123", [HIT]);
    expect(p).toContain("Acknowledgement MSC123");
    expect(p).toContain("tg-meeseva-income-cert");
    expect(p).toContain("Aadhaar card");
  });

  it("question prompt is document-scoped with requested language", () => {
    const p = buildQuestionPrompt("What documents?", "My doc text", [HIT], "Telugu");
    expect(p).toContain("What documents?");
    expect(p).toContain("My doc text");
    expect(p).toContain("Telugu");
  });
});

describe("Ollama unavailable", () => {
  it("analyzeDocument raises AIEngineUnavailableError on connection failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const engine = new OllamaGemmaEngine();
    await expect(
      engine.analyzeDocument({ text: "doc", language: "en", evidence: [HIT] })
    ).rejects.toBeInstanceOf(AIEngineUnavailableError);
  });

  it("answerQuestion raises AIEngineUnavailableError on HTTP 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const engine = new OllamaGemmaEngine();
    await expect(
      engine.answerQuestion({ question: "q", documentText: "d", language: "en", evidence: [] })
    ).rejects.toBeInstanceOf(AIEngineUnavailableError);
  });
});

describe("invalid model JSON", () => {
  it("retries once then returns the controlled unverified fallback", async () => {
    vi.stubGlobal("fetch", mockChat("definitely not json {{{"));
    const engine = new OllamaGemmaEngine();
    const { extraction, grounded } = await engine.analyzeDocument({
      text: "doc",
      language: "en",
      evidence: [HIT],
    });
    expect(grounded).toBe(false);
    expect(extraction.deadline).toBeNull();
    expect(extraction.summary).toContain("could not verify");
    // one initial call + one retry
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it("unparseable Q&A returns the exact unverified sentence", async () => {
    vi.stubGlobal("fetch", mockChat("garbage"));
    const engine = new OllamaGemmaEngine();
    const { answer, grounded } = await engine.answerQuestion({
      question: "Capital of France?",
      documentText: "income cert",
      language: "en",
      evidence: [HIT],
    });
    expect(answer).toBe(ASK_FALLBACK);
    expect(grounded).toBe(false);
  });

  it("valid Q&A JSON preserves grounded=true", async () => {
    vi.stubGlobal(
      "fetch",
      mockChat(JSON.stringify({ answer: "Aadhaar card and ration card.", verified: true }))
    );
    const engine = new OllamaGemmaEngine();
    const { answer, grounded } = await engine.answerQuestion({
      question: "What documents?",
      documentText: "income cert",
      language: "en",
      evidence: [HIT],
    });
    expect(answer).toContain("Aadhaar");
    expect(grounded).toBe(true);
  });
});
