import { NextResponse } from "next/server";
import { getSourceService } from "@/lib/sources/SourceService";

/** POST /api/sources — full provenance for rendered source IDs. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request: body must be JSON." }, { status: 400 });
  }
  const ids = (body as { ids?: unknown }).ids;
  if (!Array.isArray(ids)) {
    return NextResponse.json({ error: "Invalid request: ids must be an array." }, { status: 400 });
  }
  const sources = await getSourceService().getSources(
    ids.filter((x): x is string => typeof x === "string")
  );
  return NextResponse.json({ sources });
}
