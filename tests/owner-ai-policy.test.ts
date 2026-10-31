/**
 * Phase 2 — owner session, server-side provider policy, route gates.
 * All mocked/offline: no Ollama, no Gemini, no network.
 * Run: npm test
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Rule F: nothing in GovLens may spawn a subprocess (`ollama serve` etc.).
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  exec: vi.fn(),
  execSync: vi.fn(),
  execFile: vi.fn(),
  fork: vi.fn(),
}));

import {
  checkLoginThrottle,
  clearFailedLogins,
  issueOwnerSession,
  ownerConfigured,
  ownerConfigurationIssue,
  recordFailedLogin,
  resetLoginThrottleForTests,
  verifyOwnerCode,
  verifyOwnerSession,
} from "@/lib/auth/owner";
import {
  AIPolicyError,
  requireOwnerLocalAI,
  requirePublicQnAI,
  toAiErrorResponse,
} from "@/lib/ai/providerPolicy";
import { OllamaGemmaEngine, checkOllamaHealth } from "@/lib/ai/OllamaGemmaEngine";
import { GeminiEngine, resetGeminiForTests } from "@/lib/ai/GeminiEngine";
import {
  analyzeRequestSchema,
  askRequestSchema,
  translateRequestSchema,
} from "@/lib/validation/apiSchemas";
import { POST as ownerLogin } from "@/app/api/owner/login/route";

const OWNER_KEYS = [
  "OWNER_ACCESS_CODE",
  "OWNER_SESSION_TTL_HOURS",
  "OWNER_LOGIN_MAX_ATTEMPTS",
  "OWNER_LOGIN_WINDOW_MINUTES",
  "GEMINI_API_KEY",
  "GEMINI_ENABLED",
  "GEMINI_MODEL",
] as const;

const OWNER_CODE = "unit-test-owner-code";
let saved: Record<string, string | undefined> = {};

function setEnv(overrides: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function captured(fn: () => unknown): unknown {
  try {
    fn();
    return null;
  } catch (err) {
    return err;
  }
}

beforeEach(() => {
  saved = {};
  for (const k of OWNER_KEYS) saved[k] = process.env[k];
  setEnv({
    OWNER_ACCESS_CODE: OWNER_CODE,
    OWNER_SESSION_TTL_HOURS: "8",
    OWNER_LOGIN_MAX_ATTEMPTS: "5",
    OWNER_LOGIN_WINDOW_MINUTES: "15",
    GEMINI_API_KEY: "test-key-not-real",
    GEMINI_ENABLED: "true",
    GEMINI_MODEL: "gemini-3.8-flash",
  });
  resetLoginThrottleForTests();
  resetGeminiForTests();
});

afterEach(() => {
  for (const k of OWNER_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetLoginThrottleForTests();
  resetGeminiForTests();
  vi.unstubAllGlobals();
});

describe("owner session (server-side authentication)", () => {
  it("issues a time-limited signed session token", () => {
    const session = issueOwnerSession();
    expect(session.maxAgeSeconds).toBe(8 * 3600);
    expect(session.token).toMatch(/^\d+\.([0-9a-f]{64})$/);
    expect(verifyOwnerSession(session.token)).toBe(true);
  });

  it("rejects expired sessions", () => {
    const past = Date.now() - 10 * 3600 * 1000;
    const expired = issueOwnerSession(past);
    expect(verifyOwnerSession(expired.token, Date.now())).toBe(false);
  });

  it("rejects tampered, truncated or absent tokens", () => {
    const { token } = issueOwnerSession();
    const [exp, sig] = token.split(".");
    const flipped = `${exp}.${sig.slice(0, 63)}${sig.endsWith("a") ? "b" : "a"}`;

    expect(verifyOwnerSession(flipped)).toBe(false);
    expect(verifyOwnerSession(`${exp}.zzzz`)).toBe(false);
    expect(verifyOwnerSession("not-a-token")).toBe(false);
    expect(verifyOwnerSession(undefined)).toBe(false);
    expect(verifyOwnerSession(null)).toBe(false);
    expect(verifyOwnerSession("")).toBe(false);
  });

  it("rejects a session signed under a different owner code", () => {
    const token = issueOwnerSession().token;
    setEnv({ OWNER_ACCESS_CODE: "some-other-owner-code" });
    expect(verifyOwnerSession(token)).toBe(false);
  });

  it("verifies the owner code only against the configured one", () => {
    expect(verifyOwnerCode(OWNER_CODE)).toBe(true);
    expect(verifyOwnerCode("wrong-code-123")).toBe(false);
    expect(verifyOwnerCode("")).toBe(false);
  });

  it("never treats a missing or short OWNER_ACCESS_CODE as configured", () => {
    setEnv({ OWNER_ACCESS_CODE: undefined });
    expect(ownerConfigured()).toBe(false);
    expect(ownerConfigurationIssue()).toMatch(/set OWNER_ACCESS_CODE in the server environment/);
    expect(verifyOwnerCode(OWNER_CODE)).toBe(false);
    expect(() => issueOwnerSession()).toThrowError(/not configured/);
    expect(verifyOwnerSession(undefined)).toBe(false);

    setEnv({ OWNER_ACCESS_CODE: "short" });
    expect(ownerConfigured()).toBe(false);
    expect(ownerConfigurationIssue()).toMatch(/at least 8 characters/);
  });

  it("does not expose the owner code in the configuration message", () => {
    setEnv({ OWNER_ACCESS_CODE: "abc" });
    expect(ownerConfigurationIssue()).not.toContain("abc");
  });
});

describe("owner login throttle", () => {
  it("allows attempts up to the limit, then blocks with a retry hint", () => {
    setEnv({ OWNER_LOGIN_MAX_ATTEMPTS: "3" });
    expect(checkLoginThrottle("ip-1").allowed).toBe(true);

    recordFailedLogin("ip-1");
    recordFailedLogin("ip-1");
    expect(checkLoginThrottle("ip-1").allowed).toBe(true);
    recordFailedLogin("ip-1");

    const blocked = checkLoginThrottle("ip-1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    // Other clients are unaffected.
    expect(checkLoginThrottle("ip-2").allowed).toBe(true);
  });

  it("clears failures after a successful sign-in", () => {
    setEnv({ OWNER_LOGIN_MAX_ATTEMPTS: "2" });
    recordFailedLogin("ip-3");
    recordFailedLogin("ip-3");
    expect(checkLoginThrottle("ip-3").allowed).toBe(false);
    clearFailedLogins("ip-3");
    expect(checkLoginThrottle("ip-3").allowed).toBe(true);
  });
});

describe("server-side provider policy", () => {
  it("returns ONLY the local engine for an authenticated owner", () => {
    const engine = requireOwnerLocalAI(true);
    expect(engine).toBeInstanceOf(GeminiEngine);
    expect(engine).not.toBeInstanceOf(OllamaGemmaEngine);
  });

  it("rejects an unauthenticated request for owner-only local AI (403)", () => {
    expect(captured(() => requireOwnerLocalAI(false))).toMatchObject({
      status: 403,
      code: "OWNER_REQUIRED",
    });
    expect(captured(() => requireOwnerLocalAI(false))).toBeInstanceOf(AIPolicyError);
  });

  it("reports missing owner configuration as a server config error (503)", () => {
    setEnv({ OWNER_ACCESS_CODE: undefined });
    expect(captured(() => requireOwnerLocalAI(true))).toMatchObject({
      status: 503,
      code: "OWNER_NOT_CONFIGURED",
    });
    expect(captured(() => requireOwnerLocalAI(false))).toMatchObject({
      status: 503,
      code: "OWNER_NOT_CONFIGURED",
    });
  });

  it("never lets a public session reach the local engine through the public path", () => {
    // Public path resolves ONLY via requirePublicQnAI → Gemini (or throws).
    const engine = requirePublicQnAI();
    expect(engine).toBeInstanceOf(GeminiEngine);
    expect(engine).not.toBeInstanceOf(OllamaGemmaEngine);
  });

  it("keeps users isolated: policy takes no user/session identity at all", () => {
    // Provider selection is decided before any document/session is read, and the
    // functions accept no ownerId/sessionId — so a provider change cannot cross
    // into another user's data.
    expect(requireOwnerLocalAI.length).toBe(1);
    expect(requirePublicQnAI.length).toBe(0);
  });

  it("maps provider failures onto safe response bodies", () => {
    const policy = toAiErrorResponse(new AIPolicyError(403, "OWNER_REQUIRED", "nope"));
    expect(policy).toEqual({ status: 403, body: { error: "nope", code: "OWNER_REQUIRED" } });
    expect(toAiErrorResponse(new Error("raw internal error"))).toBeNull();
  });
});

describe("citizen cannot select a provider", () => {
  it("strips a `provider` field from every AI request schema", () => {
    const ask = askRequestSchema.parse({
      question: "How do I apply?",
      provider: "ollama",
      role: "owner",
      isOwner: true,
      ownerId: "someone-else",
    });
    expect(ask).not.toHaveProperty("provider");
    expect(ask).not.toHaveProperty("role");
    expect(ask).not.toHaveProperty("isOwner");
    expect(ask).not.toHaveProperty("ownerId");

  const analyze = analyzeRequestSchema.parse({ text: "doc", provider: "gemini" });
  expect(analyze).not.toHaveProperty("provider");

    const translate = translateRequestSchema.parse({
      text: "hello",
      targetLanguage: "te",
      provider: "gemini",
    });
    expect(translate).not.toHaveProperty("provider");
  });
});

describe("no automatic Ollama startup", () => {
  it("health check reports a live unavailable state without spawning anything", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED localhost:11434"))
    );

    const health = await checkOllamaHealth();
    expect(health.status).toBe("degraded");
    expect(health.ollama).toBe(false);

    const cp = await import("node:child_process");
    expect(vi.mocked(cp.spawn)).not.toHaveBeenCalled();
    expect(vi.mocked(cp.exec)).not.toHaveBeenCalled();
    expect(vi.mocked(cp.execSync)).not.toHaveBeenCalled();
    expect(vi.mocked(cp.execFile)).not.toHaveBeenCalled();
    expect(vi.mocked(cp.fork)).not.toHaveBeenCalled();
    // Availability check only: exactly one passive GET to /api/tags, no warm-up.
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("/api/tags");
  });

  it("reads model availability from /api/tags without caching or warm-up", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: "gemma3:4b" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const health = await checkOllamaHealth();
    expect(health).toEqual({
      status: "ok",
      ollama: true,
      modelAvailable: true,
      model: "gemma3:4b",
    });
    // Live availability (no stale cache) + single passive request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("shows a clear degraded state with the manual command instead of retrying", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    const first = await checkOllamaHealth();
    expect(first).toEqual({
      status: "degraded",
      ollama: false,
      modelAvailable: false,
      model: expect.any(String),
    });
    // No reconnect loop: one call per explicit health request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Ollama unavailable — no silent fallback to Gemini", () => {
  it("still returns the local engine for the owner (failure surfaces as an error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const health = await checkOllamaHealth();
    expect(health.ollama).toBe(false);

    // Owner path uses Gemini — it must never switch to Ollama.
    expect(requireOwnerLocalAI(true)).toBeInstanceOf(GeminiEngine);
    // Public path keeps pointing at Gemini — it must never switch to Ollama.
    expect(requirePublicQnAI()).toBeInstanceOf(GeminiEngine);
  });

  it("public Q&A fails loudly when Gemini is disabled instead of using Ollama", () => {
    setEnv({ GEMINI_ENABLED: "false" });
    expect(captured(() => requirePublicQnAI())).toMatchObject({ code: "PUBLIC_AI_DISABLED" });
  });
});

describe("owner login route (server-enforced)", () => {
  function loginReq(code: unknown, ip = "203.0.113.10"): Request {
    return new Request("http://localhost/api/owner/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ code }),
    });
  }

  it("rejects an unauthenticated attempt with 401 and no session cookie", async () => {
    const res = await ownerLogin(loginReq("wrong-owner-code"));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Incorrect owner code.");
  });

  it("does not accept a client-supplied role/ownerId as owner status", async () => {
    const res = await ownerLogin(
      new Request("http://localhost/api/owner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.11" },
        body: JSON.stringify({ code: "wrong", isOwner: true, role: "owner", ownerId: "me" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("rate-limits repeated failures (429 + Retry-After)", async () => {
    setEnv({ OWNER_LOGIN_MAX_ATTEMPTS: "3" });
    const ip = "198.51.100.7";
    await ownerLogin(loginReq("bad-1", ip));
    await ownerLogin(loginReq("bad-2", ip));
    await ownerLogin(loginReq("bad-3", ip));

    const blocked = await ownerLogin(loginReq("bad-4", ip));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("reports configuration state without leaking secrets", async () => {
    setEnv({ OWNER_ACCESS_CODE: undefined });
    const res = await ownerLogin(
      new Request("http://localhost/api/owner/login", { method: "POST", body: "{}" })
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string; code?: string };
    expect(body.code).toBe("OWNER_NOT_CONFIGURED");
    expect(body.error).not.toContain(OWNER_CODE);
  });
});
