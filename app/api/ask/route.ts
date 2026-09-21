import { NextResponse } from "next/server";
import { parseOrError, askRequestSchema } from "@/lib/validation/apiSchemas";
import { getSessionService } from "@/lib/sessions/SessionService";
import { getKnowledgeEngine } from "@/lib/knowledge/LocalKnowledgeEngine";
import { getAIEngine, AIEngineUnavailableError } from "@/lib/ai/OllamaGemmaEngine";
import { getSourceService } from "@/lib/sources/SourceService";

/**
 * POST /api/ask — ONE grounded Q&A model call, scoped to a session.
 * Request: { sessionId?, question, documentText?, language? }
 * Response: { answer, sources, language, grounded }
 * (+ legacy `answer: { text, sources, verified }` alias)
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request: body must be JSON." }, { status: 400 });
  }
  const parsed = parseOrError(askRequestSchema, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 });
  const { sessionId, question, documentText, language } = parsed.data;

  try {
    const sessions = getSessionService();
    let docText = documentText ?? "";
    let lang = language;
    let extractionSummary: string | undefined;
    let history: Array<{ role: "user" | "assistant"; content: string }> | undefined;

    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        return NextResponse.json(
          { error: "Unknown session. Analyze the document again to start a new session." },
          { status: 400 }
        );
      }
      docText = session.documentText;
      lang = session.language as typeof lang;
      extractionSummary = session.extraction?.summary;
      history = sessions.history(sessionId).map((m) => ({ role: m.role, content: m.content }));
    }
    if (!docText.trim()) {
      return NextResponse.json(
        { error: "No document context. Analyze a document first (or send documentText)." },
        { status: 422 }
      );
    }

    // Hindi UI requests are tagged so the engine replies in Hindi.
    // Script detection wins: a Telugu/Hindi question gets a Telugu/Hindi answer
    // even when the session document language is English. Romanized Telugu
    // (e.g. "Naku emi documents submit cheyyali?") is detected by keywords.
    const romanizedTelugu =
      /\b(naku|naaku|emi|cheyyali|cheyali|kavali|enti|ela|ekkada|eppudu|telugu|ardham|vivarinchu)\b/i.test(
        question
      );
    const scriptLang = /[\u0C00-\u0C7F]/.test(question)
      ? "te"
      : /[\u0900-\u097F]/.test(question)
        ? "hi"
        : romanizedTelugu
          ? "te"
          : null;
    const effectiveLang = scriptLang ?? lang;
    const tagged = effectiveLang === "hi" ? `[Reply in Hindi] ${question}` : question;

    const kb = getKnowledgeEngine();
    const evidence = await kb.search(`${question}\n${docText.slice(0, 2000)}`, 3);

    const engine = getAIEngine();
    const { answer, grounded } = await engine.answerQuestion({
      question: tagged.replace(/\[Reply in Hindi\] /, "[Reply in Hindi.] "),
      documentText: docText,
      language: effectiveLang,
      evidence,
      extractionSummary,
      history,
    });

    if (sessionId) {
      sessions.addMessage(sessionId, { role: "user", content: question, grounded: null });
      sessions.addMessage(sessionId, { role: "assistant", content: answer, grounded });
    }

    const sources = await getSourceService().getSources(evidence.map((h) => h.documentId));

    return NextResponse.json({
      answer,
      sources,
      language: effectiveLang,
      grounded,
    });
  } catch (err) {
    if (err instanceof AIEngineUnavailableError) {
      return NextResponse.json({ error: err.message, code: "AI_UNAVAILABLE" }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not answer the question." },
      { status: 500 }
    );
  }
}
