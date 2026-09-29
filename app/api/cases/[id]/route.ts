import { NextResponse } from "next/server";
import { parseOrError, updateCaseRequestSchema } from "@/lib/validation/apiSchemas";
import { getCaseService } from "@/lib/cases/CaseService";
import { getOrCreateUserId, isCaseworker } from "@/lib/auth/identity";

/**
 * GET /api/cases/:id — full case detail. Citizens see ONLY their own cases
 * (others → 404, never revealing existence). Caseworkers use /api/caseworker/*.
 */
/** PATCH /api/cases/:id — owner-only status update (caseworkers use /api/caseworker/*). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ownerId = getOrCreateUserId();
    const found = getCaseService().get(params.id, ownerId);
    if (!found) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    return NextResponse.json({ case: found });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load case." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request: body must be JSON." }, { status: 400 });
  }
  const parsed = parseOrError(updateCaseRequestSchema, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 });

  try {
    const svc = getCaseService();
    // Caseworker-authenticated callers may update any case; citizens only their own.
    const ownerId = isCaseworker() ? undefined : getOrCreateUserId();
    const updated = svc.updateStatus(params.id, parsed.data.status, ownerId);
    if (!updated) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    return NextResponse.json({ case: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update case." },
      { status: 500 }
    );
  }
}
