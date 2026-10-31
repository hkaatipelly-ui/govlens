import { NextResponse } from "next/server";
import { getGrievanceService } from "@/lib/grievances/GrievanceService";
import { isCaseworker } from "@/lib/auth/identity";

export async function GET() {
  if (!isCaseworker()) {
    return NextResponse.json({ error: "Caseworker access required." }, { status: 403 });
  }
  try {
    return NextResponse.json(getGrievanceService().analytics());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load analytics." },
      { status: 500 }
    );
  }
}
