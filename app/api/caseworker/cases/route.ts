import { NextResponse } from "next/server";
import { getCaseService } from "@/lib/cases/CaseService";
import { isCaseworker } from "@/lib/auth/identity";

/** GET /api/caseworker/cases — full register, authenticated caseworkers ONLY. */
export async function GET() {
  if (!isCaseworker()) {
    return NextResponse.json({ error: "Caseworker authentication required." }, { status: 401 });
  }
  try {
    return NextResponse.json({ cases: getCaseService().listAll() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not list cases." },
      { status: 500 }
    );
  }
}
