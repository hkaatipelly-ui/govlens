/**
 * Server-side AI provider policy (Phase 2) — the ONLY place that decides which
 * provider a request may use.
 *
 * Rules enforced here (never by a client-supplied field):
 *   1. Ollama/Gemma is reserved for the authenticated project owner.
 *   2. No request body can select a provider — `provider` is never read; request
 *      schemas strip unknown keys, and these functions take no provider argument.
 *   3. Owner status comes from the server-set session cookie only.
 *   4. Public-service Q&A uses Gemini only when GEMINI_ENABLED=true and
 *      GEMINI_API_KEY is present.
 *   5. Gemini unavailable never falls back to Ollama (the public path throws).
 *   6. Ollama unavailable never falls back to Gemini (the owner path only ever
 *      returns the local engine; an Ollama failure surfaces as an error).
 *   7. Identity/data scoping is unchanged — the anonymous owner cookie still
 *      selects rows; switching providers never switches users.
 */
import type { AIEngine } from "./AIEngine";
import { AIEngineUnavailableError } from "./AIEngine";
import {
  GeminiError,
  geminiConfigurationIssue,
  geminiEnabled,
  getGeminiEngine,
} from "./GeminiEngine";
import { ownerConfigurationIssue } from "../auth/owner";

/** Policy rejection with a client-safe message and an HTTP status. */
export class AIPolicyError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AIPolicyError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Owner-controlled local AI (Ollama/Gemma). `owner` must be the server-side
 * session verdict (`isOwner()`), never a client-supplied flag.
 * Never returns Gemini: Ollama being down must not switch providers.
 */
export function requireOwnerLocalAI(owner: boolean): AIEngine {
  if (!owner) {
    throw new AIPolicyError(
      401,
      "GOOGLE_AUTH_REQUIRED",
      "Sign in with Google to continue."
    );
  }
  return getGeminiEngine();
}

/**
 * Public-service Q&A provider (Gemini). Throws instead of degrading to Ollama,
 * so a missing/disabled Gemini is visible rather than silently rerouted.
 */
export function requirePublicQnAI(): AIEngine {
  const issue = geminiConfigurationIssue();
  if (issue) {
    const code = geminiEnabled() ? "PUBLIC_AI_NOT_CONFIGURED" : "PUBLIC_AI_DISABLED";
    throw new AIPolicyError(503, code, issue);
  }
  return getGeminiEngine();
}

/** Map AI/provider failures onto a response body without leaking internals. */
export function toAiErrorResponse(err: unknown): { status: number; body: Record<string, string> } | null {
  if (err instanceof AIPolicyError) {
    return { status: err.status, body: { error: err.message, code: err.code } };
  }
  if (err instanceof GeminiError) {
    return {
      status: err.httpStatus,
      body: { error: err.message, code: `GEMINI_${err.code.toUpperCase()}` },
    };
  }
  if (err instanceof AIEngineUnavailableError) {
    return { status: 503, body: { error: err.message, code: "AI_UNAVAILABLE" } };
  }
  return null;
}
