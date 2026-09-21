import { NextResponse } from "next/server";
import { parseOrError, translateRequestSchema } from "@/lib/validation/apiSchemas";
import { getAIEngine, AIEngineUnavailableError } from "@/lib/ai/OllamaGemmaEngine";

/**
 * POST /api/translate — server-side translation via local Gemma.
 * Request: { text, targetLanguage: "en" | "te" }
 * Response: { translatedText }
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request: body must be JSON." }, { status: 400 });
  }
  const parsed = parseOrError(translateRequestSchema, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 });

  try {
    const { translatedText } = await getAIEngine().translate(parsed.data);
    return NextResponse.json({ translatedText });
  } catch (err) {
    if (err instanceof AIEngineUnavailableError) {
      return NextResponse.json({ error: err.message, code: "AI_UNAVAILABLE" }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Translation failed." },
      { status: 500 }
    );
  }
}
