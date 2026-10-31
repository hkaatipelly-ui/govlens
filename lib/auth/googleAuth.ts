import { googleSubjectUserId } from "./identity";
import { AIPolicyError } from "../ai/providerPolicy";
import type { Session } from "next-auth";

/**
 * Server-side Auth.js session verifier for document-analysis and other
 * authenticated endpoints.
 *
 * - Uses the Auth.js `auth()` server function — NEVER request JSON, query
 *   params, or client-supplied role/owner flags.
 * - Sessions exist only for identities approved by the signIn callback
 *   (Google + verified email), so a valid session implies a verified identity.
 * - Returns the stable server-established user id derived from the persisted
 *   Google subject (`sub`), the verified email, and the owner/user role derived
 *   from the verified session + server config.
 * - Never falls back to the anonymous cookie identity for Google users.
 */

export interface GoogleIdentity {
  /** Verified Google account email used for server-side association only. */
  email: string;
  /** Stable internal identifier derived from the Auth.js/Google `sub` value. */
  userId: string;
  role: "user" | "owner";
  /** True always: the signIn callback only admits email_verified accounts. */
  emailVerified: true;
}

function ownerGoogleEmail(): string {
  return (process.env.OWNER_GOOGLE_EMAIL ?? "").trim().toLowerCase();
}

/** Non-secret OAuth/session configuration diagnostics (no values, only flags). */
export function oauthConfigurationIssue(): { code: string; message: string } | null {
  if (!process.env.AUTH_GOOGLE_ID?.trim() || !process.env.AUTH_GOOGLE_SECRET?.trim()) {
    return {
      code: "OAUTH_NOT_CONFIGURED",
      message:
        "Google sign-in is not configured on this server (missing AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET).",
    };
  }
  if (!process.env.AUTH_SECRET?.trim()) {
    return {
      code: "AUTH_SECRET_MISSING",
      message: "Server session secret is missing (AUTH_SECRET).",
    };
  }
  return null;
}

function identityFromSession(session: Session | null): GoogleIdentity | null {
  const sessionUser = session?.user ?? null;
  const email = sessionUser?.email?.trim();
  const subject = sessionUser?.id?.trim();
  if (!email || !subject) return null;

  const normalizedEmail = email.toLowerCase();
  const normalizedOwner = ownerGoogleEmail();
  // Owner status is derived exclusively from the verified session email and the
  // server-side OWNER_GOOGLE_EMAIL marker. A role hint alone (from the token or
  // anywhere else) can never make a different account an owner.
  const role: "user" | "owner" =
    normalizedOwner && normalizedEmail === normalizedOwner ? "owner" : "user";
  return {
    email: normalizedEmail,
    userId: googleSubjectUserId(subject),
    role,
    emailVerified: true,
  };
}

/**
 * Require a valid authenticated Google session.
 * Distinguishes:
 *   - 503 OAUTH_NOT_CONFIGURED / AUTH_SECRET_MISSING (server setup problem),
 *   - 401 GOOGLE_AUTH_REQUIRED (no valid session; normal Google users must
 *     NEVER see an owner-access-code error here).
 */
export async function requireAuthenticatedUser(): Promise<GoogleIdentity> {
  let session: Session | null = null;
  try {
    const { auth } = await import("@/auth");
    session = await auth();
  } catch (err) {
    const config = oauthConfigurationIssue();
    if (config) {
      throw new AIPolicyError(503, config.code, config.message);
    }
    // Session retrieval failed for another reason (callback/state error).
    const detail = err instanceof Error ? err.name : "unknown";
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify({ component: "google-auth", event: "session_retrieval_failed", errorName: detail }));
    throw new AIPolicyError(
      401,
      "GOOGLE_SESSION_ERROR",
      "Could not verify your Google session. Sign in again."
    );
  }
  const identity = identityFromSession(session);
  if (!identity) {
    const config = oauthConfigurationIssue();
    if (config) {
      throw new AIPolicyError(503, config.code, config.message);
    }
    throw new AIPolicyError(401, "GOOGLE_AUTH_REQUIRED", "Sign in with Google to continue.");
  }
  return identity;
}
