import { NextResponse } from "next/server";
import { getGrievanceService } from "@/lib/grievances/GrievanceService";
import { isCaseworker } from "@/lib/auth/identity";

function deny() {
  return NextResponse.json({ error: "Caseworker access required." }, { status: 403 });
}

export async function GET(req: Request) {
  if (!isCaseworker()) return deny();
  try {
    const url = new URL(req.url);
    const result = getGrievanceService().listQueue({
      category: url.searchParams.get("category") || undefined,
      status: url.searchParams.get("status") || undefined,
      location: url.searchParams.get("location") || undefined,
      search: url.searchParams.get("search") || undefined,
      sort: (url.searchParams.get("sort") as "created_desc" | "created_asc" | "updated_desc") || "created_desc",
      limit: Number(url.searchParams.get("limit") ?? "20"),
      offset: Number(url.searchParams.get("offset") ?? "0"),
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not list grievances." },
      { status: 500 }
    );
  }
}
