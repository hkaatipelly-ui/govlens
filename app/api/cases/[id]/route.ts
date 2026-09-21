import { NextResponse } from "next/server";
import { parseOrError, updateCaseRequestSchema } from "@/lib/validation/apiSchemas";
import { getCaseService } from "@/lib/cases/CaseService";

/** GET /api/cases/:id — full case detail. */
/** PATCH /api/cases/:id — update status ({ status: open|needs_review|completed }). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const found = getCaseService().get(params.id);
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
    if (!svc.get(params.id)) {
      return NextResponse.json({ error: "Case not found." }, { status: 404 });
    }
    const updated = svc.updateStatus(params.id, parsed.data.status);
    return NextResponse.json({ case: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update case." },
      { status: 500 }
    );
  }
}
