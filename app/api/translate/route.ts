import { NextResponse } from "next/server";
import { parseOrError, translateRequestSchema } from "@/lib/validation/apiSchemas";
import { requireAuthenticatedUser } from "@/lib/auth/googleAuth";
import { requireDocumentAnalysisAI, toAiErrorResponse } from "@/lib/ai/providerPolicy";
import { isSensitiveDocument } from "@/lib/ai/geminiPrivacy";
import {
  sensitiveDocumentProcessingEnabled,
  sensitiveDocumentBlockMessage,
} from "@/lib/ai/GeminiEngine";

/**
 * POST /api/translate — server-side translation via Gemini for ANY
 * authenticated Google user (authorization via Auth.js session; the legacy
 * owner-only gate is not part of this path).
 * Request: { text, targetLanguage: "en" | "te" }
 * Sensitive-document restrictions remain active.
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
    await requireAuthenticatedUser();
    if (isSensitiveDocument(parsed.data.text) && !sensitiveDocumentProcessingEnabled()) {
      return NextResponse.json(
        { error: sensitiveDocumentBlockMessage(), code: "SENSITIVE_DOCUMENT_BLOCKED" },
        { status: 403 }
      );
    }
    const engine = requireDocumentAnalysisAI();
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
