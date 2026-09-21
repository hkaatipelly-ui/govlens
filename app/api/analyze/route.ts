import { NextResponse } from "next/server";
import { getAIEngine, AIEngineUnavailableError } from "@/app/lib/ai-engine";
import { getKnowledgeEngine } from "@/app/lib/knowledge-engine";
import { randomUUID } from "node:crypto";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { text?: string; language?: string };
    const text = (body.text ?? "").trim();
    if (!text) {
      return NextResponse.json(
        { error: "No document text provided. Capture or upload a document first (OCR runs in the browser)." },
        { status: 400 }
      );
    }
    if (text.length > 20000) {
      return NextResponse.json({ error: "Document text is too long (max 20,000 characters)." }, { status: 400 });
    }

    const kb = getKnowledgeEngine();
    const evidence = await kb.search(text);
    const engine = await getAIEngine();
    const analysis = await engine.analyzeDocument({
      id: randomUUID(),
      content: text,
      language: body.language ?? "en",
      type: "unknown",
    });

    return NextResponse.json({ analysis, evidence });
  } catch (err) {
    if (err instanceof AIEngineUnavailableError) {
      return NextResponse.json(
        { error: err.message, code: "AI_UNAVAILABLE" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed." },
      { status: 500 }
    );
  }
}
