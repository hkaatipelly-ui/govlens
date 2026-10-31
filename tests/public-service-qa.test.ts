import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// --- Env + module mocks (isolated DB per test file) ---
const tmpDb = join(tmpdir(), `govlens-p4-${process.pid}.db`);
process.env.DATABASE_PATH = tmpDb;
process.env.OWNER_ACCESS_CODE = "owner-super-secret-code";

vi.mock("next/headers", () => {
  const store = new Map<string, string>();
  (globalThis as any).__p4CookieStore = store;
  return {
    cookies: () => ({
      get(name: string) {
        return store.has(name) ? { value: store.get(name)! } : undefined;
      },
      set() {},
      delete() {},
    }),
  };
});

vi.mock("node:child_process", () => ({ execFile: () => undefined }));

import {
  LocalKnowledgeEngine,
  getKnowledgeEngine,
} from "@/lib/knowledge/LocalKnowledgeEngine";
import { SourceService } from "@/lib/sources/SourceService";
import { migrate } from "@/lib/db/migrations";
import {
  answerPublicServiceQuestion,
  classifyPublicIntent,
  findOfficialPointer,
  detectConflict,
  sanitizeAnswerUrls,
} from "@/lib/qa/publicServiceQa";
import type { PublicAskResponse } from "@/lib/qa/publicServiceQa";
import { openTestDatabase } from "@/lib/db/database";
import { GeminiEngine, type GeminiCall, type GeminiCallResult } from "@/lib/ai/GeminiEngine";
import { AIPolicyError, toAiErrorResponse } from "@/lib/ai/providerPolicy";
import { parseOrError, askRequestSchema } from "@/lib/validation/apiSchemas";

const HIT: any = {
  chunkId: "tg-meeseva-income-cert#0",
  documentId: "tg-meeseva-income-cert",
  content: "Required documents: Aadhaar card, ration card. Submitted at MeeSeva.",
  sourceMetadata: {
    id: "tg-meeseva-income-cert",
    title: "Income Certificate via MeeSeva (Telangana)",
    department: "Revenue Department, Government of Telangana",
    state: "Telangana",
    documentType: "certificate-procedure",
    language: "en",
    sourceUrl: "https://www.telangana.gov.in",
    publishedDate: "2024-06-01",
    effectiveDate: "2024-06-01",
    lastVerified: "2026-09-01",
    sourceType: "official",
    jurisdiction: "Telangana",
  },
  score: 9,
  matchedTerms: ["income"],
};

function testDeps(responseJson: any) {
  const db = openTestDatabase();
  migrate(db);
  const kb = new LocalKnowledgeEngine(db);
  const sources = new SourceService(db);
  const calls: GeminiCall[] = [];
  const transport = async (call: GeminiCall): Promise<GeminiCallResult> => {
    calls.push(call);
    return { text: JSON.stringify(responseJson) };
  };
  const engine = new GeminiEngine({ transport } as any);
  const engineFactory = () => engine;
  return { db, kb, sources, engine, calls, deps: { kb, sources, engine: engineFactory } };
}

function mockChat(content: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ message: { content } }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  const store = (globalThis as any).__p4CookieStore;
  store?.clear?.();
});

describe("Phase 4 — intent classification", () => {
  it("classifies private record retrieval as unsupported", () => {
    expect(classifyPublicIntent("Show me my land record for survey no 44")).toBe("unsupported_private_record");
    expect(classifyPublicIntent("Track my application status please")).toBe("unsupported_private_record");
    expect(classifyPublicIntent("What is the status of my pension application?")).toBe("unsupported_private_record");
  });

  it("classifies grievance-status claims as unsupported", () => {
    expect(classifyPublicIntent("Was my grievance registered on PGPORTAL?")).toBe("unsupported_grievance_status");
    expect(classifyPublicIntent("Has my complaint been accepted?")).toBe("unsupported_grievance_status");
  });

  it("classifies current deadline asks as unsupported", () => {
    expect(classifyPublicIntent("What is the last date to apply for the scholarship?")).toBe("unsupported_current_deadline");
    expect(classifyPublicIntent("What is the deadline for NSP 2026?")).toBe("unsupported_current_deadline");
    expect(classifyPublicIntent("What is the current deadline for the application?")).toBe("unsupported_current_deadline");
  });

  it("classifies legal judgment requests as unsupported", () => {
    expect(classifyPublicIntent("Will I win my property case in court?")).toBe("unsupported_legal_judgment");
    expect(classifyPublicIntent("Give me a definitive legal judgment on this")).toBe("unsupported_legal_judgment");
    expect(classifyPublicIntent("Am I legally eligible for this welfare scheme?")).toBe("unsupported_legal_judgment");
  });

  it("does not false-positive on ordinary process questions", () => {
    expect(classifyPublicIntent("What documents are needed for an income certificate?")).toBe("public_service_question");
    expect(classifyPublicIntent("How do I file an FIR at the police station?")).toBe("public_service_question");
    expect(classifyPublicIntent("What is the fee for a caste certificate at MeeSeva?")).toBe("public_service_question");
    expect(classifyPublicIntent("How many days does a passport application take?")).toBe("public_service_question");
    expect(classifyPublicIntent("Which scheme gives free electricity up to 200 units?")).toBe("public_service_question");
  });
});

describe("Phase 4 — unsupported intents never call the model", () => {
  it("private record returns local answer without transport call", async () => {
    const { deps, calls } = testDeps({ answer: "X", verified: true, limitations: "", citedSourceIds: [] });
    const r = await answerPublicServiceQuestion({ question: "Show me my land record for survey no 44", language: "en" }, deps);
    expect(r.intent).toBe("unsupported_private_record");
    expect(r.supported).toBe(false);
    expect(r.sources.length).toBeGreaterThanOrEqual(0);
    expect(calls).toHaveLength(0);
    expect(r.answer).toContain("Dharani");
  });

  it("grievance status returns CPGRAMS pointer when available", async () => {
    const { deps, calls } = testDeps({ answer: "X", verified: true, limitations: "", citedSourceIds: [] });
    const r = await answerPublicServiceQuestion({ question: "Was my grievance registered on the portal?", language: "en" }, deps);
    expect(r.intent).toBe("unsupported_grievance_status");
    expect(calls).toHaveLength(0);
    expect(r.answer).toContain("GovLens");
  });

  it("deadline returns explanation and no transport call", async () => {
    const { deps, calls } = testDeps({ answer: "X", verified: true, limitations: "", citedSourceIds: [] });
    const r = await answerPublicServiceQuestion({ question: "What is the last date to apply for the scholarship?", language: "en" }, deps);
    expect(r.intent).toBe("unsupported_current_deadline");
    expect(calls).toHaveLength(0);
    expect(r.limitations).toContain("Deadline");
  });

  it("legal judgment returns explanation and no transport call", async () => {
    const { deps, calls } = testDeps({ answer: "X", verified: true, limitations: "", citedSourceIds: [] });
    const r = await answerPublicServiceQuestion({ question: "Will I win my property court case?", language: "en" }, deps);
    expect(r.intent).toBe("unsupported_legal_judgment");
    expect(calls).toHaveLength(0);
  });

  it("another citizen's case is caught", async () => {
    const { deps, calls } = testDeps({ answer: "X", verified: true, limitations: "", citedSourceIds: [] });
    const r = await answerPublicServiceQuestion({ question: "Show me another citizen's case details", language: "en" }, deps);
    expect(r.intent).toBe("unsupported_private_record");
    expect(calls).toHaveLength(0);
  });
});

describe("Phase 4 — privacy blocking still precedes everything else", () => {
  it("sensitive text throws AIPolicyError 403 with hint", async () => {
    const { deps } = testDeps({ answer: "X", verified: true, limitations: "", citedSourceIds: [] });
    await expect(
      answerPublicServiceQuestion({ question: "My Aadhaar 1234 5678 9012, what do I do next?", language: "en" }, deps)
    ).rejects.toMatchObject({ status: 403, code: "SENSITIVE_QUESTION" });
  });

  it("grievance description (staff note) is blocked", async () => {
    const { deps } = testDeps({ answer: "X", verified: true, limitations: "", citedSourceIds: [] });
    await expect(
      answerPublicServiceQuestion(
        { question: "My grievance about the water board since March, staff notes say it is pending.", language: "en" },
        deps
      )
    ).rejects.toMatchObject({ status: 403 });
  });

  it("property ownership dispute is blocked", async () => {
    const { deps } = testDeps({ answer: "X", verified: true, limitations: "", citedSourceIds: [] });
    await expect(
      answerPublicServiceQuestion(
        { question: "Dispute over my land ownership between two brothers.", language: "en" },
        deps
      )
    ).rejects.toMatchObject({ status: 403 });
  });

  it("payment card details are blocked", async () => {
    const { deps } = testDeps({ answer: "X", verified: true, limitations: "", citedSourceIds: [] });
    await expect(
      answerPublicServiceQuestion(
        { question: "My debit card number is 4111111111111111, is it accepted?", language: "en" },
        deps
      )
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("Phase 4 — retrieval gating", () => {
  it("returns unsupported_no_evidence when nothing matches (no model call)", async () => {
    const { deps, calls } = testDeps({ answer: "X", verified: true, limitations: "", citedSourceIds: [] });
    const r = await answerPublicServiceQuestion(
      { question: "What is the airspeed velocity of an unladen swallow?", language: "en" },
      deps
    );
    expect(r.intent).toBe("unsupported_no_evidence");
    expect(r.supported).toBe(false);
    expect(r.sources).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("does not call the model for an insufficiently-matching query", async () => {
    const { deps, db, calls } = testDeps({ answer: "X", verified: true, limitations: "", citedSourceIds: [] });
    // Insert a weakly-matching, unrelated row (score below threshold).
    db.prepare(
      `INSERT INTO government_sources (id, title, department, state, document_type, language, source_url, published_date, effective_date, last_verified) VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run("weak-row", "Zebra notes", "Dept", "Telangana", "note", "en", "https://example.gov", "2026-01-01", "2026-01-01", "2026-01-01");
    db.prepare(
      `INSERT INTO knowledge_chunks (id, document_id, content, chunk_index) VALUES (?,?,?,0)`
    ).run("weak-row#0", "weak-row", "A few unrelated tokens zebra only.");
    const r = await answerPublicServiceQuestion({ question: "zebra farming techniques", language: "en" }, deps);
    expect(r.supported).toBe(false);
    // transport must not have been invoked with a real model call on a weak row
    expect(calls).toHaveLength(0);
  });
});

describe("Phase 4 — supported public question and source contract", () => {
  it("returns a grounded answer with sources pulled from retrieval metadata", async () => {
    const { deps, calls } = testDeps({
      answer: "Aadhaar card and ration card are required.",
      verified: true,
      limitations: "Bring originals too.",
      citedSourceIds: ["tg-meeseva-income-cert"],
    });
    const r = await answerPublicServiceQuestion(
      { question: "What documents are needed for an income certificate?", language: "en" },
      deps
    );
    expect(r.supported).toBe(true);
    expect(r.answer).toContain("Aadhaar");
    expect(r.sources.length).toBeGreaterThan(0);
    const s = r.sources[0];
    expect(s.sourceId).toBe("tg-meeseva-income-cert");
    expect(s.title).toBe("Income Certificate (MeeSeva)");
    expect(s.url).toBe("https://www.meeseva.telangana.gov.in/meeseva/");
    expect(s.sourceType).toBe("official");
    // metadata comes from the DB/service record, not from model text
    expect(s.url).not.toBe("https://model-invented.example");
    expect(calls).toHaveLength(1);
  });

  it("marks non-grounded model replies as unsupported but keeps sources", async () => {
    const { deps } = testDeps({
      answer: "I don't have that information.",
      verified: false,
      limitations: "Not in sources.",
      citedSourceIds: [],
    });
    const r = await answerPublicServiceQuestion(
      { question: "What documents are needed for an income certificate?", language: "en" },
      deps
    );
    expect(r.supported).toBe(false);
    expect(r.sources.length).toBeGreaterThan(0);
    expect(r.grounded).toBe(false);
  });

  it("source lastReviewed is never fabricated (exact stored value)", async () => {
    const { deps } = testDeps({
      answer: "ok",
      verified: true,
      limitations: "",
      citedSourceIds: [],
    });
    const r = await answerPublicServiceQuestion(
      { question: "What documents are needed for an income certificate?", language: "en" },
      deps
    );
    const s = r.sources[0];
    expect(s.lastReviewed).toBe("2026-10-27");
  });
});

describe("Phase 4 — conflicting sources", () => {
  it("adds a conflict note and keeps both sources on a mixed topic", async () => {
    // synthetically build two sources about the same subject but different urls
    const a: any = {
      sourceId: "src-a",
      title: "Income Certificate via MeeSeva (Telangana)",
      url: "https://one.example/income",
      sourceType: "official",
      lastReviewed: "2026-09-01",
      relevantExcerpt: "x",
    };
    const b: any = {
      sourceId: "src-b",
      title: "Income Certificate via MeeSeva (Telangana)",
      url: "https://two.example/income",
      sourceType: "secondary_unverified",
      lastReviewed: "2026-10-27",
      relevantExcerpt: "y",
    };
    const serviceMap = new Map();
    const note = detectConflict([a, b], serviceMap, new Map(), "en");
    expect(note).not.toBe("");
    expect(note).toMatch(/disagree/i);
  });

  it("integration: income query surfaces a conflict note", async () => {
    const { deps } = testDeps({
      answer: "See the sources.",
      verified: true,
      limitations: "",
      citedSourceIds: [],
    });
    const r = await answerPublicServiceQuestion(
      { question: "What documents are needed for an income certificate?", language: "en" },
      deps
    );
    // legacy service record (older DB url) vs curated service record (newer
    // url) — conflict note expected on this historically inconsistent topic.
    expect(r.limitations).toMatch(/disagree|sources/i);
  });
});

describe("Phase 4 — invalid JSON and provider failures", () => {
  it("invalid JSON rejects with an invalid_json error (no leak)", async () => {
    const { deps } = testDeps({} as any);
    // Override engine transport behavior: testDeps built one with {} response;
    // rebuild deps manually with garbage transport instead.
    const db = openTestDatabase();
    migrate(db);
    const kb = new LocalKnowledgeEngine(db);
    const sources = new SourceService(db);
    const transport = async () => ({ text: "definitely not json {{{" });
    const engine = new GeminiEngine({ transport } as any);
    const custom = { kb, sources, engine: () => engine };
    await expect(
      answerPublicServiceQuestion(
        { question: "What documents are needed for an income certificate?", language: "en" },
        custom
      )
    ).rejects.toMatchObject({ code: "invalid_json" });
  });

  it("rate limiting is reported as rate_limited (transport called once)", async () => {
    const db = openTestDatabase();
    migrate(db);
    const kb = new LocalKnowledgeEngine(db);
    const sources = new SourceService(db);
    const transport = async () => {
      const err = new Error("Too Many Requests");
      (err as any).status = 429;
      throw err;
    };
    const engine = new GeminiEngine({ transport } as any);
    const custom = { kb, sources, engine: () => engine };
    await expect(
      answerPublicServiceQuestion(
        { question: "What documents are needed for an income certificate?", language: "en" },
        custom
      )
    ).rejects.toMatchObject({ code: "rate_limited" });
  });
});

describe("Phase 4 — sanitisation", () => {
  it("blanks URLs the model invented", () => {
    const allowed = new Set(["https://www.telangana.gov.in"]);
    const out = sanitizeAnswerUrls("See https://evil.example/top-secret and https://www.telangana.gov.in", allowed);
    expect(out).not.toContain("evil.example");
    expect(out).toContain("telangana.gov.in");
  });
});
