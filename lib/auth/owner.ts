/**
 * Owner session + login throttle (server-only, additive to the caseworker gate).
 *
 * The owner is the person who operates this GovLens deployment. Owner status is
 * established ONLY server-side:
 *   - the access code lives in the server environment (OWNER_ACCESS_CODE), never
 *     in Git, never in a client payload, and has NO built-in default;
 *   - a successful login issues a time-limited HMAC-signed session token stored
 *     in an HttpOnly cookie (so a leaked token cannot outlive its expiry);
 *   - login attempts are rate-limited per client key.
 *
 * This gate protects the owner-controlled local AI (Ollama/Gemma). It does not
 * replace or weaken the existing caseworker gate in lib/auth/identity.ts.
 */
import { cookies } from "next/headers";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const OWNER_COOKIE = "govlens_owner";

const MIN_CODE_LENGTH = 8;
const DEFAULT_TTL_HOURS = 8;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MINUTES = 15;
const MAX_TRACKED_KEYS = 256;

function positiveInt(raw: string | undefined, fallback: number, min = 1): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
}

// --- Configuration (server environment only, never a hard-coded password) ---

/** Why owner sign-in is unavailable, or null when properly configured. */
export function ownerConfigurationIssue(): string | null {
  const raw = process.env.OWNER_ACCESS_CODE;
  if (!raw || !raw.trim()) {
    return "Owner access is not configured: set OWNER_ACCESS_CODE in the server environment (no default is built in).";
  }
  if (raw.trim().length < MIN_CODE_LENGTH) {
    return `Owner access is not configured: OWNER_ACCESS_CODE must be at least ${MIN_CODE_LENGTH} characters.`;
  }
  return null;
}

export function ownerConfigured(): boolean {
  return ownerConfigurationIssue() === null;
}

function ownerAccessCode(): string | null {
  return ownerConfigured() ? process.env.OWNER_ACCESS_CODE!.trim() : null;
}

export function ownerSessionTtlSeconds(): number {
  return positiveInt(process.env.OWNER_SESSION_TTL_HOURS, DEFAULT_TTL_HOURS) * 3600;
}

// --- Code verification (constant-time) ---

function codeDigest(code: string): Buffer {
  return createHash("sha256").update(`govlens-owner:${code}`).digest();
}

/** Pure helper (unit-testable): does this code match the configured one? */
export function verifyOwnerCode(code: string): boolean {
  const configured = ownerAccessCode();
  if (!configured) return false;
  const a = codeDigest(code);
  const b = codeDigest(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

// --- Session token: "<expiryMs>.<hmac-sha256-hex>" ---

function sessionSecret(): Buffer | null {
  const configured = ownerAccessCode();
  if (!configured) return null;
  return createHash("sha256").update(`govlens-owner-session:${configured}`).digest();
}

function sessionSignature(exp: number, secret: Buffer): string {
  return createHmac("sha256", secret).update(`govlens-owner-session:${exp}`).digest("hex");
}

export interface OwnerSession {
  token: string;
  maxAgeSeconds: number;
}

export function issueOwnerSession(now = Date.now()): OwnerSession {
  const secret = sessionSecret();
  if (!secret) throw new Error(ownerConfigurationIssue() ?? "Owner access is not configured.");
  const maxAgeSeconds = ownerSessionTtlSeconds();
  const exp = now + maxAgeSeconds * 1000;
  return { token: `${exp}.${sessionSignature(exp, secret)}`, maxAgeSeconds };
}

/** Pure helper (unit-testable): valid signature AND not expired? */
export function verifyOwnerSession(token: string | null | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const secret = sessionSecret();
  if (!secret) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expRaw = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d{1,15}$/.test(expRaw) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= now) return false;
  const expected = sessionSignature(exp, secret);
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

// --- Cookie (server-established; a client-supplied role/ownerId is never read) ---

function cookieFlags(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function isOwner(): boolean {
  return verifyOwnerSession(cookies().get(OWNER_COOKIE)?.value);
}

export function setOwnerCookie(session: OwnerSession): void {
  cookies().set(OWNER_COOKIE, session.token, cookieFlags(session.maxAgeSeconds));
}

export function clearOwnerCookie(): void {
  cookies().set(OWNER_COOKIE, "", { ...cookieFlags(0), maxAge: 0 });
}

// --- Login throttle (in-memory, per client key) ---

interface AttemptRecord {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, AttemptRecord>();

export interface ThrottleState {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
}

export function checkLoginThrottle(key: string, now = Date.now()): ThrottleState {
  const maxAttempts = positiveInt(process.env.OWNER_LOGIN_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS);
  const record = attempts.get(key);
  if (!record || record.resetAt <= now) {
    if (record) attempts.delete(key);
    return { allowed: true, remainingAttempts: maxAttempts, retryAfterSeconds: 0 };
  }
  if (record.count >= maxAttempts) {
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((record.resetAt - now) / 1000)),
    };
  }
  return {
    allowed: true,
    remainingAttempts: maxAttempts - record.count,
    retryAfterSeconds: 0,
  };
}

export function recordFailedLogin(key: string, now = Date.now()): void {
  const windowMs =
    positiveInt(process.env.OWNER_LOGIN_WINDOW_MINUTES, DEFAULT_WINDOW_MINUTES) * 60_000;
  const record = attempts.get(key);
  if (!record || record.resetAt <= now) {
    // Bound memory: drop expired keys before growing past the cap.
    if (attempts.size >= MAX_TRACKED_KEYS) {
      for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
      if (attempts.size >= MAX_TRACKED_KEYS) attempts.clear();
    }
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  record.count += 1;
}

export function clearFailedLogins(key: string): void {
  attempts.delete(key);
}

/** Test-only: reset the in-memory throttle between test cases. */
export function resetLoginThrottleForTests(): void {
  attempts.clear();
}
