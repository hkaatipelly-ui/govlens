import { NextResponse } from "next/server";
import {
  verifyCaseworkerCode,
  setCaseworkerCookie,
  clearCaseworkerCookie,
  isCaseworker,
} from "@/lib/auth/identity";

/** POST /api/caseworker/login — demo access-code gate (server-enforced). */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request: body must be JSON." }, { status: 400 });
  }
  const code = (body as { code?: unknown }).code;
  if (typeof code !== "string" || !code) {
    return NextResponse.json({ error: "Access code is required." }, { status: 400 });
  }
  if (!verifyCaseworkerCode(code.trim())) {
    return NextResponse.json({ error: "Incorrect access code." }, { status: 401 });
  }
  setCaseworkerCookie();
  return NextResponse.json({ ok: true });
}

/** GET /api/caseworker/login — session check for the dashboard gate. */
export async function GET() {
  return NextResponse.json({ authenticated: isCaseworker() });
}

/** POST with { logout: true } — end the caseworker session. */
export async function DELETE() {
  clearCaseworkerCookie();
  return NextResponse.json({ ok: true });
}
