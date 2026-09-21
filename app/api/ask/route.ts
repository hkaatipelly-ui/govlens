import { NextResponse } from "next/server";
import { getAIEngine, AIEngineUnavailableError } from "@/app/lib/ai-engine";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      question?: string;
      documentText?: string;
      language?: "en" | "te" | "hi";
    };
    const question = (body.question ?? "").trim();
    if (!question) {
      return NextResponse.json({ error: "Question is empty." }, { status: 400 });
    }
    const engine = await getAIEngine();
    const tagged = body.language === "hi" ? `[Reply in Hindi] ${question}` : question;
    const answer = await engine.answerQuestion(tagged, body.documentText ?? "");
    return NextResponse.json({ answer });
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
