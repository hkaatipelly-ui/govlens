import { NextResponse } from "next/server";
import {
  checkLoginThrottle,
  clearFailedLogins,
  clearOwnerCookie,
  isOwner,
  issueOwnerSession,
  ownerConfigured,
  ownerConfigurationIssue,
  recordFailedLogin,
  setOwnerCookie,
  verifyOwnerCode,
} from "@/lib/auth/owner";

/**
 * LEGACY owner access-code gate — independent of public Google authentication.
 *
 * This route is NOT part of the normal login flow:
 *   - Normal login is Google-based (Auth.js) and NEVER requires OWNER_ACCESS_CODE.
 *   - Document analysis authorizes ANY authenticated Google user
 *     (lib/auth/googleAuth.ts), never the owner cookie from this route.
 *   - The legacy gate may still be used by server-side admin tooling that wants
 *     a separate owner-code session; deployments that authenticate the owner
 *     via OWNER_GOOGLE_EMAIL do not need it.
 *
 * POST   /api/owner/login — exchange OWNER_ACCESS_CODE for a time-limited
 *        HttpOnly owner session (rate-limited per client key).
 * GET    /api/owner/login — legacy session/config probe (kept for older
 *        tooling; pages no longer depend on it).
 * DELETE /api/owner/login — sign out of the legacy owner session.
 */

function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "local";
  return "local";
}

export async function POST(req: Request) {
  const googleOnlyOwner = Boolean(
    process.env.OWNER_GOOGLE_EMAIL?.trim() && !process.env.OWNER_ACCESS_CODE?.trim()
  );
  if (googleOnlyOwner) {
    return NextResponse.json(
      {
        error:
          "This deployment authenticates the owner via Google sign-in; OWNER_ACCESS_CODE is not configured. Google sign-in and document analysis are unaffected.",
        code: "OWNER_NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }
  const issue = ownerConfigurationIssue();
  if (issue || !ownerConfigured()) {
    return NextResponse.json(
      { error: issue ?? "Owner access is not configured.", code: "OWNER_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  const key = clientKey(req);
  const throttle = checkLoginThrottle(key);
  if (!throttle.allowed) {
    return NextResponse.json(
      {
        error: `Too many sign-in attempts. Try again in ${throttle.retryAfterSeconds} seconds.`,
        code: "OWNER_THROTTLED",
      },
      { status: 429, headers: { "retry-after": String(throttle.retryAfterSeconds) } }
    );
  }

  let code = "";
  try {
    const body = (await req.json()) as { code?: unknown };
    if (typeof body?.code === "string") code = body.code;
  } catch {
    code = "";
  }
  // Never trust a client-supplied role/owner flag: only the server code issue
  // decides ownership here.
  if (!verifyOwnerCode(code.trim())) {
    recordFailedLogin(key);
    return NextResponse.json(
      { error: "Incorrect owner code.", code: "OWNER_LOGIN_FAILED" },
      { status: 401 }
    );
  }

  clearFailedLogins(key);
  setOwnerCookie(issueOwnerSession());
  return NextResponse.json({ ok: true });
}

export async function GET() {
  // Legacy probe shape ({ authenticated, configured }); pages use
  // /api/auth/session (Auth.js) instead.
  return NextResponse.json({ authenticated: isOwner(), configured: ownerConfigured() });
}

export async function DELETE() {
  clearOwnerCookie();
  return NextResponse.json({ ok: true });
}
