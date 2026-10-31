/**
 * Phase 2 — Gemini provider (mocked; NO real network, no quota consumed).
 * Run: npm test
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  GeminiEngine,
  GeminiError,
  classifyGeminiFailure,
  checkGeminiHealth,
  geminiConfigured,
  geminiModel,
  resetGeminiForTests,
  type GeminiCall,
  type GeminiCallResult,
  type GeminiTransport,
} from "@/lib/ai/GeminiEngine";
import { requirePublicQnAI } from "@/lib/ai/providerPolicy";
import { screenPublicQuestion } from "@/lib/ai/geminiPrivacy";
import { OllamaGemmaEngine } from "@/lib/ai/OllamaGemmaEngine";
import type { KnowledgeHit } from "@/lib/knowledge/KnowledgeEngine";

const EVIDENCE: KnowledgeHit[] = [
  {
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
  },
];

const ENV_KEYS = [
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_ENABLED",
  "GEMINI_TIMEOUT_MS",
  "GEMINI_MAX_OUTPUT_TOKENS",
] as const;
let saved: Record<string, string | undefined> = {};

function setGeminiEnv(overrides: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

/** Transport that records every call it receives. */
function recordingTransport(
  impl: (call: GeminiCall) => GeminiCallResult | Promise<GeminiCallResult> | never
) {
  const calls: GeminiCall[] = [];
  const transport: GeminiTransport = async (call) => {
    calls.push(call);
    return impl(call);
  };
  return { calls, transport };
}

function ask(engine: GeminiEngine, overrides: Partial<Parameters<GeminiEngine["answerQuestion"]>[0]> = {}) {
  return engine.answerQuestion({
    question: "Which documents are needed for an income certificate?",
    documentText: "",
    language: "en",
    evidence: EVIDENCE,
    ...overrides,
  });
}

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  setGeminiEnv({
    GEMINI_API_KEY: "test-key-not-real",
    GEMINI_MODEL: "gemini-3.8-flash",
    GEMINI_ENABLED: "true",
    GEMINI_TIMEOUT_MS: "2000",
    GEMINI_MAX_OUTPUT_TOKENS: "512",
  });
  resetGeminiForTests();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetGeminiForTests();
});

describe("Gemini structured response handling", () => {
  it("returns a valid structured answer and marks it grounded when evidence exists", async () => {
    const { calls, transport } = recordingTransport(() => ({
      text: JSON.stringify({ answer: "Apply at MeeSeva with Aadhaar and ration card.", verified: true }),
    }));
    const engine = new GeminiEngine({ transport });
    const result = await ask(engine);

    expect(result.answer).toContain("MeeSeva");
    expect(result.grounded).toBe(true);
    expect(calls).toHaveLength(1);
    // Provider received the structured-output schema and a bounded timeout.
    expect(calls[0].jsonSchema).toBeTruthy();
    expect(calls[0].timeoutMs).toBe(2000);
    expect(calls[0].maxOutputTokens).toBe(512);
    // Evidence IDs and source metadata are preserved into the provider call
    // for traceability (Phase 4 prompt format).
    expect(calls[0].input).toContain("sourceId=tg-meeseva-income-cert");
    expect(calls[0].input).toContain("title=Income Certificate via MeeSeva");
  });

  it("marks the answer ungrounded when the model says it is unverified", async () => {
    const { transport } = recordingTransport(() => ({
      text: JSON.stringify({ answer: "I do not have that in the excerpts.", verified: false }),
    }));
    const result = await ask(new GeminiEngine({ transport }));
    expect(result.grounded).toBe(false);
  });

  it("distinguishes malformed output (retries once, then fails as invalid_json)", async () => {
    const { calls, transport } = recordingTransport(() => ({ text: "not json {" }));
    const engine = new GeminiEngine({ transport });

    await expect(ask(engine)).rejects.toMatchObject({ code: "invalid_json", httpStatus: 502 });
    expect(calls).toHaveLength(2); // bounded: exactly one repair attempt
    expect(calls[1].input).toMatch(/not valid JSON/i);
  });

  it("distinguishes valid JSON with invalid application fields (invalid_fields)", async () => {
    const { calls, transport } = recordingTransport(() => ({
      text: JSON.stringify({ answer: 42, verified: "yes" }),
    }));
    const engine = new GeminiEngine({ transport });

    await expect(ask(engine)).rejects.toMatchObject({ code: "invalid_fields", httpStatus: 502 });
    expect(calls).toHaveLength(2);
    expect(calls[1].input).toMatch(/invalid fields/i);
  });

  it("reports a blocked/safety response without retrying", async () => {
    const { calls, transport } = recordingTransport(() => ({ blockedReason: "SAFETY" }));
    const engine = new GeminiEngine({ transport });

    await expect(ask(engine)).rejects.toMatchObject({ code: "blocked", httpStatus: 422 });
    expect(calls).toHaveLength(1);
  });

  it("reports empty content as a distinct failure", async () => {
    const { calls, transport } = recordingTransport(() => ({ text: "   " }));
    const engine = new GeminiEngine({ transport });

    await expect(ask(engine)).rejects.toMatchObject({ code: "empty", httpStatus: 502 });
    expect(calls).toHaveLength(1);
  });
});

describe("Gemini configuration and transport failures", () => {
  it("fails clearly when the API key is missing (no request attempted)", async () => {
    setGeminiEnv({ GEMINI_API_KEY: undefined });
    const engine = new GeminiEngine();

    await expect(ask(engine)).rejects.toMatchObject({ code: "not_configured" });
    expect(geminiConfigured()).toBe(false);
    expect(checkGeminiHealth().ok).toBe(false);
  });

  it("reports an invalid key (401) once, without echoing the key", async () => {
    const { calls, transport } = recordingTransport(() => {
      const err = new Error("Request had invalid API key test-key-not-real") as Error & {
        status: number;
      };
      err.status = 401;
      throw err;
    });
    const engine = new GeminiEngine({ transport });

    const failure = await ask(engine).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(GeminiError);
    expect((failure as GeminiError).code).toBe("auth");
    expect(String((failure as GeminiError).message)).not.toContain("test-key-not-real");
    expect(calls).toHaveLength(1); // an authorization failure is never retried
  });

  it("reports rate limiting (429) once and does not retry", async () => {
    const { calls, transport } = recordingTransport(() => {
      const err = new Error("quota exceeded") as Error & { status: number };
      err.status = 429;
      throw err;
    });
    const engine = new GeminiEngine({ transport });

    await expect(ask(engine)).rejects.toMatchObject({ code: "rate_limited", httpStatus: 429 });
    expect(calls).toHaveLength(1);
  });

  it("reports a timeout as a distinct failure", async () => {
    const { transport } = recordingTransport(() => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    });
    await expect(ask(new GeminiEngine({ transport }))).rejects.toMatchObject({
      code: "timeout",
      httpStatus: 504,
    });
  });

  it("reports a network/provider failure without leaking the upstream message", async () => {
    const { transport } = recordingTransport(() => {
      const err = new Error("connect ECONNREFUSED 1.2.3.4 (prompt text leak?)");
      throw err;
    });
    const failure = await ask(new GeminiEngine({ transport })).catch((e: unknown) => e);
    expect((failure as GeminiError).code).toBe("network");
    expect(String((failure as GeminiError).message)).not.toContain("prompt text leak");
  });

  it("treats the model name as configuration and never substitutes on 404", () => {
    setGeminiEnv({ GEMINI_MODEL: "gemini-4-experimental" });
    expect(geminiModel()).toBe("gemini-4-experimental");

    const failure = classifyGeminiFailure({ status: 404 }, 1000);
    expect(failure.code).toBe("model_unavailable");
    expect(failure.message).toContain("gemini-4-experimental");
    expect(failure.message).toMatch(/never substitutes/i);
  });

  it("reports connectivity failure (HTTP 5xx) distinctly", () => {
    expect(classifyGeminiFailure({ status: 503 }, 1000)).toMatchObject({ code: "network" });
  });
});

/** Capture a synchronous throw so tests can assert on typed error fields. */
function captured(fn: () => unknown): unknown {
  try {
    fn();
    return null;
  } catch (err) {
    return err;
  }
}

describe("provider policy — no silent fallback", () => {
  it("returns the Gemini engine when configured and enabled", () => {
    const engine = requirePublicQnAI();
    expect(engine).toBeInstanceOf(GeminiEngine);
    expect(engine).not.toBeInstanceOf(OllamaGemmaEngine);
  });

  it("throws instead of falling back to Ollama when Gemini is disabled", () => {
    setGeminiEnv({ GEMINI_ENABLED: "false" });
    expect(captured(() => requirePublicQnAI())).toMatchObject({
      status: 503,
      code: "PUBLIC_AI_DISABLED",
    });
  });

  it("throws instead of falling back to Ollama when the key is missing", () => {
    setGeminiEnv({ GEMINI_API_KEY: undefined });
    expect(captured(() => requirePublicQnAI())).toMatchObject({
      status: 503,
      code: "PUBLIC_AI_NOT_CONFIGURED",
    });
  });

  it("surfaces a Gemini failure as a GeminiError (never an Ollama result)", async () => {
    const { transport } = recordingTransport(() => ({ text: "" }));
    const failure = await ask(new GeminiEngine({ transport })).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(GeminiError);
    expect(failure).not.toBeInstanceOf(OllamaGemmaEngine);
  });

  it("health status never contains the API key", () => {
    const health = checkGeminiHealth();
    expect(JSON.stringify(health)).not.toContain("test-key-not-real");
    expect(health).toMatchObject({ configured: true, enabled: true, model: "gemini-3.8-flash" });
  });

  it("records the last connection outcome for health (kind only, no content)", async () => {
    const ok = recordingTransport(() => ({
      text: JSON.stringify({ answer: "Apply at MeeSeva.", verified: true }),
    }));
    await ask(new GeminiEngine({ transport: ok.transport }));
    expect(checkGeminiHealth().lastOutcome).toBe("ok");

    const failing = recordingTransport(() => {
      const err = new Error("quota") as Error & { status: number };
      err.status = 429;
      throw err;
    });
    await ask(new GeminiEngine({ transport: failing.transport })).catch(() => undefined);

    const health = checkGeminiHealth();
    expect(health.lastOutcome).toBe("error");
    expect(health.lastErrorKind).toBe("rate_limited");
    expect(health.detail).toContain("rate_limited");
    expect(JSON.stringify(health)).not.toContain("test-key-not-real");
  });
});

describe("privacy screen (runs before any bytes leave the server)", () => {
  it("allows general, non-sensitive public-service questions", () => {
    for (const question of [
      "Which documents are needed for an income certificate?",
      "How do I file an FIR at the police station?",
      "What is the fee for a caste certificate at MeeSeva?",
      "How many days does a passport application take?",
      "What is the Ration Card portability process in Telangana?",
      "Which scheme gives free electricity up to 200 units?",
    ]) {
      expect(screenPublicQuestion(question), question).toEqual({ allowed: true, reasons: [] });
    }
  });

  it("blocks likely personal identifiers and private-case content", () => {
    const blocked: Array<[string, RegExp]> = [
      ["My Aadhaar 1234 5678 9012 — what next?", /Aadhaar/],
      ["PAN ABCDE1234F income proof accepted?", /PAN/],
      ["Email me at ravi.k@example.com", /email/],
      ["Call me on 9848012345 about my application", /mobile/],
      ["IFSC code UTIB0001234 for refund", /IFSC/],
      ["My FIR No 45/2026 status please", /case or FIR/],
      ["I was arrested, what should I do?", /personal legal/],
      ["Survey No 12/3 land record details", /land or property/],
      ["My medical prescription for leave", /medical/],
      ["My passport copy details are wrong", /identity document/],
      ["Account number 1234567890123456 refund", /bank account/],
    ];
    for (const [question, reasonPattern] of blocked) {
      const verdict = screenPublicQuestion(question);
      expect(verdict.allowed, question).toBe(false);
      expect(verdict.reasons.join(", "), question).toMatch(reasonPattern);
    }
  });

  it("returns reasons without echoing the matched content", () => {
    const verdict = screenPublicQuestion("My Aadhaar 1234 5678 9012 help");
    expect(verdict.allowed).toBe(false);
    expect(JSON.stringify(verdict)).not.toContain("1234");
  });
});
describe("Gemini document scan uses only Gemini, never Ollama", () => {
  it("attempts cloud generation for owner-selected non-sensitive documents", async () => {
    const { calls, transport } = recordingTransport(() => ({
      text: JSON.stringify({ cleanedText: "clean", language: "en", confidence: 0.9, warnings: [] }),
    }));
    const engine = new GeminiEngine({ transport });
    const out = await engine.cleanupOcrText({ rawText: "Simple property tax notice amount Rs 500" });
    expect(out.cleanedText).toBe("clean");
    expect(calls).toHaveLength(1);
    expect(calls[0].system).toContain("GovLens");
  });
});


describe("privacy — cloud processing of sensitive content is prevented", () => {
  it("refuses questions that carry personal identifiers before any transport call", async () => {
    const { calls, transport } = recordingTransport(() => ({ text: "{}" }));
    const engine = new GeminiEngine({ transport });

    await expect(
      ask(engine, { question: "What do I do with my Aadhaar 1234 5678 9012 and PAN ABCDE1234F?" })
    ).rejects.toMatchObject({ code: "privacy", httpStatus: 403 });
    expect(calls).toHaveLength(0);
  });

  it("refuses document/session content outright", async () => {
    const { calls, transport } = recordingTransport(() => ({ text: "{}" }));
    const engine = new GeminiEngine({ transport });

    await expect(ask(engine, { documentText: "Land record survey 12/3 for Ramesh" })).rejects.toMatchObject({
      code: "privacy",
    });
    await expect(
      ask(engine, { extractionSummary: "RELEVANT CACHED CLAIMS: - owner notes" })
    ).rejects.toMatchObject({ code: "privacy" });
    await expect(
      ask(engine, { history: [{ role: "user", content: "hi" }] })
    ).rejects.toMatchObject({ code: "privacy" });
    expect(calls).toHaveLength(0);
  });

  it("refuses every document-bound contract method", async () => {
    const engine = new GeminiEngine();
    const documentInput = { text: "private land record", language: "en" as const, evidence: [] };

    await expect(engine.extractDocumentFields(documentInput)).rejects.toMatchObject({
      code: "privacy",
    });
    await expect(engine.analyzeDocument(documentInput)).rejects.toMatchObject({ code: "privacy" });
    await expect(engine.cleanupOcrText({ rawText: "private" })).rejects.toMatchObject({      code: "privacy",
    });
    await expect(
      engine.translate({ text: "private land record summary", targetLanguage: "te" })
    ).rejects.toMatchObject({ code: "privacy" });
    await expect(
      engine.verifyGovernmentDocument({ ocrText: "private", language: "en" })
    ).rejects.toMatchObject({ code: "privacy" });
    await expect(
      engine.analyzeDeep({ documentText: "private", language: "en", questions: [], evidence: [] })
    ).rejects.toMatchObject({ code: "privacy" });
  });
});
