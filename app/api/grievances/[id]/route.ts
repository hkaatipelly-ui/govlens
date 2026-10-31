import { NextResponse } from "next/server";
import { getGrievanceService } from "@/lib/grievances/GrievanceService";
import { getOrCreateUserId, scopedAuthUserId } from "@/lib/auth/identity";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ownerId = await scopedAuthUserId();
    const grievance = getGrievanceService().get(id, ownerId);
    if (!grievance) {
      // Same message for both 404-vs-403 to avoid distinguishing records.
      return NextResponse.json(
        { error: "Grievance not found or access denied." },
        { status: 404 }
      );
    }
    return NextResponse.json({ grievance });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not fetch grievance." },
      { status: 500 }
    );
  }
}
