import { describe, it, expect, vi, afterEach } from "vitest";
import { OllamaGemmaEngine } from "@/lib/ai/OllamaGemmaEngine";
import { GovernmentDocumentVerificationService } from "@/lib/verification/GovernmentDocumentVerificationService";
import {
  verificationSchema,
  explanationSchema,
  ocrCleanupSchema,
} from "@/lib/verification/schemas";
import type { KnowledgeHit } from "@/lib/knowledge/KnowledgeEngine";
import type { DocumentExtraction } from "@/lib/extraction/schemas";

afterEach(() => {
  vi.unstubAllGlobals();
});

function hit(documentId: string, score: number, matchedTerms: string[] = ["income", "certificate"]): KnowledgeHit {
  return {
    chunkId: `${documentId}#0`,
    documentId,
    content: "Required documents: Aadhaar card, ration card.",
    sourceMetadata: {
      id: documentId,
      title: "Income Certificate via MeeSeva",
      department: "Revenue Department",
      state: "Telangana",
      documentType: "certificate-procedure",
      language: "en",
      sourceUrl: "https://example.in",
      publishedDate: "2024-01-01",
      effectiveDate: "2024-01-01",
      lastVerified: "2026-09-01",
    },
    score,
    matchedTerms,
  };
}

function mockChat(content: string, capture?: { body?: unknown }) {
  return vi.fn().mockImplementation(async (_url: string, init: { body?: string }) => {
    if (capture && init?.body) capture.body = JSON.parse(init.body as string);
    return { ok: true, json: async () => ({ message: { content } }) };
  });
}

const LIKELY = JSON.stringify({
  status: "likely_government",
  confidence: 0.75,
  documentType: "acknowledgement",
  organization: "Revenue Department",
  reasons: ["Mentions MeeSeva and application number"],
  matchedSources: [],
  verificationWarnings: [],
  visualSignals: [],
});

describe("verification schemas", () => {
  it("accepts a full verification payload", () => {
    expect(verificationSchema.safeParse(JSON.parse(LIKELY)).success).toBe(true);
  });

  it("rejects an invented 'verified' bypass? (schema allows, service caps — see below)", () => {
    const claimed = { ...JSON.parse(LIKELY), status: "verified" };
    expect(verificationSchema.safeParse(claimed).success).toBe(true);
  });

  it("explanation + cleanup schemas validate", () => {
    expect(
      explanationSchema.safeParse({
        summary: "s",
        importantPoints: ["a"],
        whatToDo: ["b"],
        deadline: "",
        amount: "",
        verificationNote: "n",
        sourceIds: ["x"],
      }).success
    ).toBe(true);
    expect(
      ocrCleanupSchema.safeParse({ cleanedText: "abc", language: "en", confidence: 0.9, warnings: [] })
        .success
    ).toBe(true);
  });
});

describe("GovernmentDocumentVerificationService (stages A–F)", () => {
  it("'verified' ONLY with strong official-source evidence", async () => {
    vi.stubGlobal("fetch", mockChat(LIKELY));
    const svc = new GovernmentDocumentVerificationService(new OllamaGemmaEngine());
    const out = await svc.verify({
      ocrText: "Income certificate application MeeSeva acknowledgement MSC1",
      evidence: [hit("tg-meeseva-income-cert", 12, ["income", "certificate", "meeseva"])],
    });
    expect(out.status).toBe("verified");
    expect(out.matchedSources).toContain("tg-meeseva-income-cert");
  });

  it("content-only clues cap at likely_government", async () => {
    vi.stubGlobal("fetch", mockChat(LIKELY));
    const svc = new GovernmentDocumentVerificationService(new OllamaGemmaEngine());
    const out = await svc.verify({ ocrText: "Some application with reference number", evidence: [] });
    expect(out.status).toBe("likely_government");
    expect(out.verificationWarnings.join(" ")).toContain("No matching official source");
  });

  it("engine-claimed 'verified' without evidence is capped", async () => {
    const claimed = JSON.stringify({ ...JSON.parse(LIKELY), status: "verified" });
    vi.stubGlobal("fetch", mockChat(claimed));
    const svc = new GovernmentDocumentVerificationService(new OllamaGemmaEngine());
    const out = await svc.verify({ ocrText: "random paper", evidence: [] });
    expect(out.status).not.toBe("verified");
  });

  it("not_government passes through", async () => {
    const nope = JSON.stringify({
      ...JSON.parse(LIKELY),
      status: "not_government",
      reasons: ["Shopping receipt, commercial content"],
    });
    vi.stubGlobal("fetch", mockChat(nope));
    const svc = new GovernmentDocumentVerificationService(new OllamaGemmaEngine());
    const out = await svc.verify({ ocrText: "DMart shopping receipt total Rs 450", evidence: [] });
    expect(out.status).toBe("not_government");
  });

  it("double model failure yields uncertain (never throws)", async () => {
    vi.stubGlobal("fetch", mockChat("garbage{{{"));
    const svc = new GovernmentDocumentVerificationService(new OllamaGemmaEngine());
    const out = await svc.verify({ ocrText: "???", evidence: [] });
    expect(out.status).toBe("uncertain");
  });
});

describe("deterministic decoding + vision payload", () => {
  it("sends temperature 0 and a JSON-schema format for extraction", async () => {
    const capture: { body?: unknown } = {};
    const payload = JSON.stringify({
      documentType: "Notice",
      title: null,
      organization: null,
      summary: "A notice.",
      deadline: null,
      amount: null,
      referenceNumber: null,
      requiredDocuments: [],
      requiredActions: [],
      warningSignals: [],
      language: "en",
      sourceIds: [],
    });
    vi.stubGlobal("fetch", mockChat(payload, capture));
    const engine = new OllamaGemmaEngine();
    await engine.extractDocumentFields({ text: "notice", language: "en", evidence: [] });
    const body = capture.body as { options?: { temperature?: number }; format?: unknown };
    expect(body.options?.temperature).toBe(0);
    expect(body.format).toMatchObject({ type: "object" });
  });

  it("vision requests include images for Gemma", async () => {
    const capture: { body?: unknown } = {};
    vi.stubGlobal("fetch", mockChat(LIKELY, capture));
    const engine = new OllamaGemmaEngine();
    await engine.verifyGovernmentDocument({ ocrText: "doc", imageDataUrl: "data:image/jpeg;base64,AAA" });
    const body = capture.body as { messages?: Array<{ images?: string[] }> };
    expect(body.messages?.[1]?.images).toEqual(["AAA"]);
  });

  it("cleanup preserves text on double failure", async () => {
    vi.stubGlobal("fetch", mockChat("nope{{{"));
    const engine = new OllamaGemmaEngine();
    const out = await engine.cleanupOcrText({ rawText: "raw ocr 123" });
    expect(out.cleanedText).toBe("raw ocr 123");
    expect(out.warnings.length).toBeGreaterThan(0);
  });

  it("action plan validates and falls back to throw (route catches)", async () => {
    const plan = JSON.stringify({
      actions: [{ title: "Visit counter", detail: "Take receipt" }],
      reminders: ["Carry originals"],
      deadline: "7 days",
      sourceIds: [],
    });
    vi.stubGlobal("fetch", mockChat(plan));
    const engine = new OllamaGemmaEngine();
    const extraction = {
      documentType: "Receipt",
      title: null,
      organization: null,
      summary: "s",
      deadline: "7 days",
      amount: null,
      referenceNumber: null,
      requiredDocuments: [],
      requiredActions: [],
      warningSignals: [],
      language: "en",
      sourceIds: [],
    } as DocumentExtraction;
    const out = await engine.generateActionPlan({ extraction, evidence: [] });
    expect(out.actions[0].title).toBe("Visit counter");
  });
});
