import { NextResponse } from "next/server";
import { z } from "zod";
import { getGrievanceService } from "@/lib/grievances/GrievanceService";
import { isCaseworker, scopedAuthUserId } from "@/lib/auth/identity";

function deny() {
  return NextResponse.json({ error: "Caseworker access required." }, { status: 403 });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isCaseworker()) return deny();
  const { id } = await params;
  try {
    const s = getGrievanceService();
    const grievance = s.getAny(id);
    if (!grievance) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const history = s.historyForStaff(id);
    return NextResponse.json({ grievance, history });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not fetch." }, { status: 500 });
  }
}

const bodySchema = z.object({
  newStatus: z.enum(["SUBMITTED", "UNDER_REVIEW", "NEEDS_INFORMATION", "RESOLVED", "CLOSED"]),
  publicMessage: z.string().trim().max(500).optional(),
  internalNote: z.string().trim().max(1000).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isCaseworker()) return deny();
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request: body must be JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  try {
    const s = getGrievanceService();
    const ownerId = await scopedAuthUserId();
    const updated = s.updateStatus(
      id,
      // for staff action owner is the grievance owner lookup; updateStatus takes ownerId only for get (ownership).
      // Caseworker transitioning must operate on any grievance, so use the record's ownerId.
      // Resolve record first:
      (s.getAny(id)?.ownerId ?? ownerId),
      parsed.data.newStatus,
      ownerId,
      "caseworker",
      parsed.data.publicMessage,
      parsed.data.internalNote
    );
    if (!updated) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ grievance: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed." },
      { status: 400 }
    );
  }
}
