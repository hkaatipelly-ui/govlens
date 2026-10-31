import { NextResponse } from "next/server";
import { getGrievanceService } from "@/lib/grievances/GrievanceService";
import { getOrCreateUserId } from "@/lib/auth/identity";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ownerId = getOrCreateUserId();
    const result = getGrievanceService().history(id, ownerId, false);
    if (!result) {
      return NextResponse.json(
        { error: "Grievance not found or access denied." },
        { status: 404 }
      );
    }
    return NextResponse.json({
      grievanceId: id,
      status: result.status,
      history: result.history,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not fetch history." },
      { status: 500 }
    );
  }
}
