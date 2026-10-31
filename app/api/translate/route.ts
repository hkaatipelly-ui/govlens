import { NextResponse } from "next/server";
import { parseOrError, translateRequestSchema } from "@/lib/validation/apiSchemas";
import { isOwner } from "@/lib/auth/owner";
import { requireOwnerLocalAI, toAiErrorResponse } from "@/lib/ai/providerPolicy";

/**
 * POST /api/translate — server-side translation via local Gemma (owner-only
 * local AI: translation input is document-derived, so it never goes to a hosted
 * provider and never runs for an unauthenticated public session).
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
    const engine = requireOwnerLocalAI(isOwner());
    const { translatedText } = await engine.translate(parsed.data);
    return NextResponse.json({ translatedText });
  } catch (err) {
    const ai = toAiErrorResponse(err);
    if (ai) return NextResponse.json(ai.body, { status: ai.status });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Translation failed." },
      { status: 500 }
    );
  }
}
