import { NextResponse } from "next/server";
import { getKnowledgeEngine } from "@/app/lib/knowledge-engine";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { ids?: string[] };
    const ids = Array.isArray(body.ids) ? body.ids.slice(0, 6) : [];
    const kb = getKnowledgeEngine();
    const out = [];
    for (const id of ids) {
      try {
        out.push(await kb.getSourceMetadata(String(id)));
      } catch {
        /* skip unknown ids */
      }
    }
    return NextResponse.json({ sources: out });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load sources." },
      { status: 500 }
    );
  }
}
