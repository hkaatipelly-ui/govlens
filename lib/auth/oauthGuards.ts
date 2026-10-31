/**
 * Pure, dependency-free OAuth guard helpers for the GovLens Google flow.
 * Imported by auth.ts (Auth.js config) and unit tests — NO next-auth imports
 * here so tests can mock "@/auth" without loading the real NextAuth runtime.
 */

type SignInProfile = {
  email?: unknown;
  email_verified?: unknown;
  sub?: unknown;
} & Record<string, unknown>;

export type SignInVerdict =
  | { ok: true }
  | { ok: false; reason: "provider_mismatch" | "email_missing" | "email_unverified" };

/** Pure, unit-testable sign-in gate: provider Google + verified email required. */
export function googleSignInApproved(
  account: { provider?: string } | null | undefined,
  profile: unknown
): SignInVerdict {
  if (account?.provider !== "google") return { ok: false, reason: "provider_mismatch" };
  const p = (profile ?? {}) as SignInProfile;
  if (typeof p.email !== "string" || !p.email.trim()) {
    return { ok: false, reason: "email_missing" };
  }
  if (p.email_verified !== true) return { ok: false, reason: "email_unverified" };
  return { ok: true };
}

/**
 * Pure, unit-testable role mapping: OWNER_GOOGLE_EMAIL marker, not an allowlist.
 * Unconfigured owner email → every verified account is "user" (login works;
 * owner controls remain unavailable).
 */
export function googleRoleForVerifiedEmail(email: unknown): "owner" | "user" {
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  const ownerEmail = (process.env.OWNER_GOOGLE_EMAIL ?? "").trim().toLowerCase();
  return ownerEmail && normalized === ownerEmail ? "owner" : "user";
}

/** Non-secret OAuth/session configuration booleans, for safe diagnostics only. */
export function oauthConfigurationStatus(): {
  googleClientId: boolean;
  googleClientSecret: boolean;
  authSecret: boolean;
  ownerEmail: boolean;
} {
  return {
    googleClientId: Boolean(process.env.AUTH_GOOGLE_ID?.trim()),
    googleClientSecret: Boolean(process.env.AUTH_GOOGLE_SECRET?.trim()),
    authSecret: Boolean(process.env.AUTH_SECRET?.trim()),
    ownerEmail: Boolean(process.env.OWNER_GOOGLE_EMAIL?.trim()),
  };
}
