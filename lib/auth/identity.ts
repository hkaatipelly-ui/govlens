/** Anonymous identity + caseworker gate (server-only, Next.js route handlers). */
import { cookies } from "next/headers";
import { randomUUID, createHash, timingSafeEqual } from "node:crypto";

export const USER_COOKIE = "govlens_user_id";
const CW_COOKIE = "govlens_caseworker";

export const PROTOTYPE_OWNER = "prototype-admin";

function cookieFlags(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

function isValidUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/**
 * Server-established identity. Never trusts client-supplied IDs —
 * always derived from the server-managed HttpOnly cookie.
 */
export function getOrCreateUserId(): string {
  const store = cookies();
  const existing = store.get(USER_COOKIE)?.value;
  if (existing && isValidUuid(existing)) return existing;
  const id = randomUUID();
  store.set(USER_COOKIE, id, cookieFlags(60 * 60 * 24 * 365));
  return id;
}

// --- Caseworker gate (demo-grade, server-enforced) ---

export function caseworkerCode(): string {
  const code = process.env.CASEWORKER_ACCESS_CODE;
  if (!code) {
    console.warn("[GovLens] CASEWORKER_ACCESS_CODE not set — using demo default. Set it in production.");
    return "govlens-demo";
  }
  return code;
}

function codeHash(code: string): Buffer {
  return createHash("sha256").update(`govlens-cw:${code}`).digest();
}

/** Pure helper (unit-testable): does this code match the configured one? */
export function verifyCaseworkerCode(code: string): boolean {
  const a = codeHash(code);
  const b = codeHash(caseworkerCode());
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isCaseworker(): boolean {
  const token = cookies().get(CW_COOKIE)?.value;
  if (!token || token.length !== 64) return false;
  try {
    const a = Buffer.from(token, "hex");
    const b = codeHash(caseworkerCode());
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function setCaseworkerCookie(): void {
  cookies().set(CW_COOKIE, codeHash(caseworkerCode()).toString("hex"), cookieFlags(60 * 60 * 12));
}

export function clearCaseworkerCookie(): void {
  cookies().set(CW_COOKIE, "", { ...cookieFlags(0), maxAge: 0 });
}
