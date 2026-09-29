import { describe, it, expect, vi, afterEach } from "vitest";
import { chunkDocument } from "@/lib/ai/chunking";
import { stageBudget, OllamaGemmaEngine } from "@/lib/ai/OllamaGemmaEngine";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chunking (provenance preserved)", () => {
  it("single chunk for small docs", () => {
    const chunks = chunkDocument("Short acknowledgement. ".repeat(20));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageStart).toBe(1);
  });

  it("splits large docs by page markers without losing pages", () => {
    const page = (n: number) => `[Page ${n}]\n` + `Content line ${n}. `.repeat(120);
    const text = [1, 2, 3, 4].map(page).join("\n\n");
    expect(text.length).toBeGreaterThan(6000);
    const chunks = chunkDocument(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThanOrEqual(4);
    // every chunk carries its page range
    expect(chunks.every((c) => c.pageEnd >= c.pageStart)).toBe(true);
    // no chunk exceeds a sane bound
    expect(chunks.every((c) => c.text.length <= 4500)).toBe(true);
  });

  it("never splits mid-sentence where avoidable", () => {
    const sents = Array(60).fill("The applicant Ramesh Kumar submitted form MSC1 on 20-09-2026.").join(" ");
    const chunks = chunkDocument(sents + " " + sents);
    for (const c of chunks.slice(0, -1)) {
      expect(c.text.trim()).toMatch(/[.!?]$/);
    }
  });
});

describe("stage budgets (configurable, temp-0 path unchanged)", () => {
  it("returns per-stage defaults", () => {
    expect(stageBudget("CLEANUP")).toBe(256);
    expect(stageBudget("EXTRACT")).toBe(512);
    expect(stageBudget("DEEP")).toBe(1024);
  });

  it("sends temperature 0 + stage budget to Ollama", async () => {
    let body: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_u: string, init: { body?: string }) => {
        body = JSON.parse(init.body ?? "{}");
        return {
          ok: true,
          json: async () => ({
            message: {
              content: JSON.stringify({ answer: "Aadhaar card.", verified: true }),
            },
          }),
        };
      })
    );
    const engine = new OllamaGemmaEngine();
    await engine.answerQuestion({ question: "q?", documentText: "d", language: "en", evidence: [] });
    const opts = (body as { options?: { temperature?: number; num_predict?: number } }).options;
    expect(opts?.temperature).toBe(0);
    expect(opts?.num_predict).toBe(512);
  });
});

describe("chunked extraction merge (mocked)", () => {
  it("merges per-chunk outputs deterministically", async () => {
    const mk = (docType: string, docs: string[], ref: string | null) =>
      JSON.stringify({
        documentType: docType, title: null, organization: null,
        summary: `Summary ${docType} with extra detail to win longest.`,
        deadline: null, amount: null, referenceNumber: ref,
        requiredDocuments: docs, requiredActions: [], warningSignals: [],
        language: "en", sourceIds: [],
      });
    const calls = [mk("Receipt", ["Aadhaar"], null), mk("Receipt", ["Ration"], "MSC1")];
    let i = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => ({ message: { content: calls[Math.min(i++, calls.length - 1)] } }),
      }))
    );
    const engine = new OllamaGemmaEngine();
    const big = `[Page 1]\n${"Receipt text. ".repeat(200)}\n\n[Page 2]\n${"More receipt text. ".repeat(200)}`;
    expect(big.length).toBeGreaterThan(6000);
    const out = await engine.extractDocumentFields({ text: big, language: "en", evidence: [] });
    expect(out.documentType).toBe("Receipt");
    expect(out.requiredDocuments).toContain("Aadhaar");
    expect(out.requiredDocuments).toContain("Ration");
    expect(out.referenceNumber).toBe("MSC1");
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
