import { NextResponse } from "next/server";
import { auth, oauthConfigurationStatus } from "@/auth";

/**
 * GET /api/auth/status — safe public diagnostics for the Google authentication
 * flow. Returns ONLY configuration booleans and the caller's own session state:
 *   - OAuth provider configuration (credentials present, not their values)
 *   - Session retrieval state + server-derived role owner|user
 *   - Verified-email validation and session creation
 *
 * Never returns or logs OAuth tokens, client secrets, API keys, cookies, or
 * user emails. Owner/user separation is derived server-side from the verified
 * Auth.js session — a browser cannot set `role` here.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = oauthConfigurationStatus();
  let authenticated = false;
  let role: "user" | "owner" | null = null;
  let sessionError: string | null = null;
  try {
    const session = await auth();
    const user = session?.user ?? null;
    authenticated = Boolean(user?.id?.trim() || user?.email?.trim());
    role = user ? (user.role === "owner" ? "owner" : "user") : null;
  } catch (err) {
    sessionError = err instanceof Error ? err.name : "unknown";
  }

  const googleConfigured = config.googleClientId && config.googleClientSecret && config.authSecret;

  return NextResponse.json({
    // Configuration booleans (never credential values).
    config: {
      ...config,
      googleProviderEnabled: googleConfigured,
    },
    // Session retrieval result for the CALLING session only.
    session: {
      authenticated,
      role,
      error: sessionError,
    },
    // Static flow description for operators (what the server enforces).
    flow: {
      provider: "google",
      requiresVerifiedEmail: true,
      requiresOwnerEmailAllowlist: false,
      signInGate: "signIn callback rejects accounts without a verified email",
      sessionIdentity: "Google subject (sub) persisted in the Auth.js JWT",
      roleDetermination: "OWNER_GOOGLE_EMAIL marker only; every other verified account is 'user'",
      documentAnalysisAuthorization:
        "any authenticated Google user via lib/auth/googleAuth.requireAuthenticatedUser()",
      legacyOwnerAccessCode: "independent admin-only gate; not part of Google login",
      redirectHint: "https://<your-deployment>/api/auth/callback/google",
    },
  });
}
