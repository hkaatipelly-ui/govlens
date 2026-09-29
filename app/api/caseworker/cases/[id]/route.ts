import { NextResponse } from "next/server";
import { getCaseService } from "@/lib/cases/CaseService";
import { isCaseworker } from "@/lib/auth/identity";

/** GET /api/caseworker/cases/:id — any case detail, authenticated caseworkers ONLY. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!isCaseworker()) {
    return NextResponse.json({ error: "Caseworker authentication required." }, { status: 401 });
  }
  try {
    const found = getCaseService().get(params.id, undefined, true);
    if (!found) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    return NextResponse.json({ case: found });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load case." },
      { status: 500 }
    );
  }
}
