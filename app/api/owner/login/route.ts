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
 * POST   /api/owner/login — exchange the server-configured owner code for a
 *        time-limited HttpOnly owner session (rate-limited per client key).
 * GET    /api/owner/login — session/config check for the sign-in page.
 * DELETE /api/owner/login — sign out.
 */

function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "local";
  return "local";
}

export async function POST(req: Request) {
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
        retryAfterSeconds: throttle.retryAfterSeconds,
      },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request: body must be JSON." }, { status: 400 });
  }
  const code = (body as { code?: unknown }).code;
  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "Owner code is required." }, { status: 400 });
  }

  if (!verifyOwnerCode(code.trim())) {
    recordFailedLogin(key);
    return NextResponse.json({ error: "Incorrect owner code." }, { status: 401 });
  }

  clearFailedLogins(key);
  setOwnerCookie(issueOwnerSession());
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ authenticated: isOwner(), configured: ownerConfigured() });
}

export async function DELETE() {
  clearOwnerCookie();
  return NextResponse.json({ ok: true });
}
