/**
 * Public Google authentication flow tests.
 * Auth.js sessions are mocked; Gemini is offline (env-configured only).
 * Run: npm test -- tests/auth-flow.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Rule F: nothing in GovLens may spawn a subprocess.
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  exec: vi.fn(),
  execSync: vi.fn(),
  execFile: vi.fn(),
  fork: vi.fn(),
}));

// Mock ONLY the Auth.js runtime `auth()` — the module factory never loads
// next-auth internals, so no Next.js runtime is needed in tests. The pure
// sign-in/role helpers live in "@/lib/auth/oauthGuards" (imported unmocked).
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => null),
}));

const { auth } = await import("@/auth");
import { googleSignInApproved, googleRoleForVerifiedEmail } from "@/lib/auth/oauthGuards";
import {
  requireAuthenticatedUser,
  oauthConfigurationIssue,
} from "@/lib/auth/googleAuth";
import { googleSubjectUserId } from "@/lib/auth/identity";
import { AIPolicyError, requireDocumentAnalysisAI } from "@/lib/ai/providerPolicy";
import { GeminiEngine } from "@/lib/ai/GeminiEngine";
import { POST as analyzeRoute } from "@/app/api/analyze/route";
import { POST as askRoute } from "@/app/api/ask/route";
import { POST as translateRoute } from "@/app/api/translate/route";

/** Loose typing for the mocked Auth.js auth() function (exported by "@/auth"). */
interface AuthMock {
  mockReset(): void;
  mockImplementation(impl: (...args: unknown[]) => Promise<unknown>): void;
}
const authMock = auth as unknown as AuthMock;

const ENV_KEYS = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "OWNER_GOOGLE_EMAIL",
  "GEMINI_API_KEY",
  "GEMINI_ENABLED",
  "GEMINI_MODEL",
  "GEMINI_ALLOW_SENSITIVE_DOCUMENTS",
] as const;

let saved: Record<string, string | undefined> = {};

function setEnv(overrides: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

type TestSession = {
  user: { id: string; email: string; role: "user" | "owner"; name?: string | null; image?: string | null };
  expires: string;
};

function sessionFor(email: string, subject: string, role: "user" | "owner"): TestSession {
  return { user: { id: subject, email, role, name: null, image: null }, expires: "1970-01-01T00:00:00.000Z" };
}

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  setEnv({
    AUTH_SECRET: "test-auth-secret-not-real",
    AUTH_GOOGLE_ID: "test-client-id.apps.googleusercontent.com",
    AUTH_GOOGLE_SECRET: "test-client-secret-not-real",
    GEMINI_API_KEY: "test-key-not-real",
    GEMINI_ENABLED: "true",
    GEMINI_MODEL: "gemini-3.8-flash",
  });
  authMock.mockReset();
  authMock.mockImplementation(async () => null);
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function captured(fn: () => unknown | Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}

describe("signIn gate (pure, mocked-OAuth policy)", () => {
  it("allows ANY verified Google email — no owner allowlist", () => {
    expect(
      googleSignInApproved({ provider: "google" }, { email: "stranger@any-domain.example", email_verified: true, sub: "sub-1" })
    ).toEqual({ ok: true });
    expect(
      googleSignInApproved({ provider: "google" }, { email: "whatever@gmail.com", email_verified: true })
    ).toEqual({ ok: true });
  });

  it("rejects an unverified Google identity", () => {
    expect(googleSignInApproved({ provider: "google" }, { email: "a@b.c", email_verified: false })).toEqual({
      ok: false,
      reason: "email_unverified",
    });
  });

  it("rejects a missing email", () => {
    expect(googleSignInApproved({ provider: "google" }, { email_verified: true })).toEqual({
      ok: false,
      reason: "email_missing",
    });
  });

  it("rejects a non-Google provider", () => {
    expect(googleSignInApproved({ provider: "credentials" }, { email: "a@b.c", email_verified: true })).toEqual({
      ok: false,
      reason: "provider_mismatch",
    });
    expect(googleSignInApproved(null, { email: "a@b.c", email_verified: true })).toEqual({
      ok: false,
      reason: "provider_mismatch",
    });
  });
});

describe("owner/user role determination", () => {
  it("maps OWNER_GOOGLE_EMAIL to the owner role", () => {
    setEnv({ OWNER_GOOGLE_EMAIL: "owner@deployment.example" });
    expect(googleRoleForVerifiedEmail("Owner@Deployment.example")).toBe("owner");
    expect(googleRoleForVerifiedEmail("someone-else@example.com")).toBe("user");
  });

  it("does not block ordinary login when OWNER_GOOGLE_EMAIL is missing", () => {
    setEnv({ OWNER_GOOGLE_EMAIL: undefined });
    expect(googleRoleForVerifiedEmail("anyone@example.com")).toBe("user");
    // The signIn gate never consults the owner email at all:
    expect(googleSignInApproved({ provider: "google" }, { email: "x@y.z", email_verified: true })).toEqual({ ok: true });
  });
});

describe("stable Google-subject user id", () => {
  it("is deterministic per subject and depends on AUTH_SECRET", () => {
    const a1 = googleSubjectUserId("google-sub-42");
    const a2 = googleSubjectUserId("google-sub-42");
    expect(a1).toBe(a2);
    expect(googleSubjectUserId("google-sub-42")).not.toBe(googleSubjectUserId("google-sub-43"));
    const prevSecret = process.env.AUTH_SECRET;
    setEnv({ AUTH_SECRET: "different-test-secret" });
    expect(googleSubjectUserId("google-sub-42")).not.toBe(a1);
    setEnv({ AUTH_SECRET: prevSecret });
  });

  it("requires a present subject", () => {
    expect(() => googleSubjectUserId("   ")).toThrow();
  });
});

describe("OAuth configuration diagnostics (never leaks values)", () => {
  it("detects missing Google client credentials", () => {
    setEnv({ AUTH_GOOGLE_ID: undefined, AUTH_GOOGLE_SECRET: undefined });
    expect(oauthConfigurationIssue()?.code).toBe("OAUTH_NOT_CONFIGURED");
  });

  it("detects a missing AUTH_SECRET", () => {
    setEnv({ AUTH_SECRET: undefined });
    expect(oauthConfigurationIssue()?.code).toBe("AUTH_SECRET_MISSING");
  });

  it("returns null when fully configured", () => {
    expect(oauthConfigurationIssue()).toBeNull();
  });
});

describe("requireAuthenticatedUser (server-side Auth.js verdict)", () => {
  it("rejects an unauthenticated request with 401 GOOGLE_AUTH_REQUIRED", async () => {
    const err = (await captured(() => requireAuthenticatedUser())) as AIPolicyError;
    expect(err).toBeInstanceOf(AIPolicyError);
    expect(err.status).toBe(401);
    expect(err.code).toBe("GOOGLE_AUTH_REQUIRED");
  });

  it("returns 503 OAUTH_NOT_CONFIGURED instead of a misleading auth error when credentials are missing", async () => {
    setEnv({ AUTH_GOOGLE_ID: undefined, AUTH_GOOGLE_SECRET: undefined });
    const err = (await captured(() => requireAuthenticatedUser())) as AIPolicyError;
    expect(err.status).toBe(503);
    expect(err.code).toBe("OAUTH_NOT_CONFIGURED");
  });

  it("accepts any verified session and returns the subject-derived userId", async () => {
    authMock.mockImplementation(async () => sessionFor("civic.user@example.com", "google-sub-77", "user"));
    const identity = await requireAuthenticatedUser();
    expect(identity).toMatchObject({
      email: "civic.user@example.com",
      role: "user",
      emailVerified: true,
    });
    expect(identity.userId).toBe(googleSubjectUserId("google-sub-77"));
  });

  it("marks the configured owner email as owner", async () => {
    setEnv({ OWNER_GOOGLE_EMAIL: "owner@deployment.example" });
    authMock.mockImplementation(async () => sessionFor("owner@deployment.example", "google-sub-owner", "owner"));
    const identity = await requireAuthenticatedUser();
    expect(identity.role).toBe("owner");
    expect(identity.userId).toBe(googleSubjectUserId("google-sub-owner"));
  });

  it("never grants owner to a different verified account (even with a spoofed role)", async () => {
    // Provider never sends role claims; even a hypothetical owner-marked token
    // for another account is overridden by the server-side email match.
    setEnv({ OWNER_GOOGLE_EMAIL: "owner@deployment.example" });
    authMock.mockImplementation(async () => sessionFor("impostor@deployment.example", "google-sub-impostor", "owner"));
    const identity = await requireAuthenticatedUser();
    expect(identity.role).toBe("user");
  });

  it("gives different Google accounts different isolated user ids", async () => {
    authMock.mockImplementation(async () => sessionFor("a@example.com", "sub-A", "user"));
    const userA = await requireAuthenticatedUser();
    authMock.mockImplementation(async () => sessionFor("b@example.com", "sub-B", "user"));
    const userB = await requireAuthenticatedUser();
    expect(userA.userId).not.toBe(userB.userId);
  });
});

describe("document-analysis provider policy", () => {
  it("returns the Gemini engine for any authenticated user path", () => {
    expect(requireDocumentAnalysisAI()).toBeInstanceOf(GeminiEngine);
  });

  it("fails loudly (503) instead of switching providers when Gemini is disabled", () => {
    setEnv({ GEMINI_ENABLED: "false" });
    expect(() => requireDocumentAnalysisAI()).toThrow(AIPolicyError);
  });
});

describe("route gates via mocked Auth.js sessions", () => {
  function jsonReq(url: string, body: unknown): Request {
    return new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("analyze: unauthenticated request → 401 GOOGLE_AUTH_REQUIRED", async () => {
    const res = await analyzeRoute(jsonReq("http://localhost/api/analyze", { text: "Ration card renewal notice text.", cloudConsent: true }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("GOOGLE_AUTH_REQUIRED");
  });

  it("analyze: authenticated ordinary user is NOT 401 (never owner-gated)", async () => {
    authMock.mockImplementation(async () => sessionFor("normal.user@example.com", "sub-normal", "user"));
    const res = await analyzeRoute(
      jsonReq("http://localhost/api/analyze", { text: "Ration card renewal notice text.", cloudConsent: false })
    );
    // Not 401: the flow proceeds and fails on missing CONSENT (403) instead.
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("CLOUD_CONSENT_REQUIRED");
  });

  it("analyze: cloud consent remains mandatory even for the owner", async () => {
    setEnv({ OWNER_GOOGLE_EMAIL: "owner@deployment.example" });
    authMock.mockImplementation(async () => sessionFor("owner@deployment.example", "sub-owner", "owner"));
    const res = await analyzeRoute(
      jsonReq("http://localhost/api/analyze", { text: "Ration card renewal notice text.", cloudConsent: false })
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("CLOUD_CONSENT_REQUIRED");
  });

  it("analyze: sensitive-document restriction stays active", async () => {
    authMock.mockImplementation(async () => sessionFor("normal.user@example.com", "sub-normal", "user"));
    const res = await analyzeRoute(
      jsonReq("http://localhost/api/analyze", {
        text: "Aadhaar card details for resident 4444 5555 6666.",
        cloudConsent: true,
      })
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("SENSITIVE_DOCUMENT_BLOCKED");
  });

  it("ask: unauthenticated document Q&A → 401", async () => {
    const res = await askRoute(
      jsonReq("http://localhost/api/ask", { question: "What is the deadline?", documentText: "A public welfare scheme notice." })
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("GOOGLE_AUTH_REQUIRED");
  });

  it("ask: sensitive documentText is blocked even when authenticated", async () => {
    authMock.mockImplementation(async () => sessionFor("normal.user@example.com", "sub-normal", "user"));
    const res = await askRoute(
      jsonReq("http://localhost/api/ask", {
        question: "What does it say?",
        documentText: "Medical certificate for patient, diagnosis mentioned.",
      })
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("SENSITIVE_DOCUMENT_BLOCKED");
  });

  it("translate: unauthenticated request → 401; authenticated sensitive text → 403", async () => {
    const res = await translateRoute(
      jsonReq("http://localhost/api/translate", { text: "Translate this notice text.", targetLanguage: "te" })
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("GOOGLE_AUTH_REQUIRED");

    authMock.mockImplementation(async () => sessionFor("normal.user@example.com", "sub-normal", "user"));
    const res2 = await translateRoute(
      jsonReq("http://localhost/api/translate", { text: "Legal notice mentioning FIR against the resident.", targetLanguage: "te" })
    );
    expect(res2.status).toBe(403);
    const body2 = (await res2.json()) as { code?: string };
    expect(body2.code).toBe("SENSITIVE_DOCUMENT_BLOCKED");
  });
});
