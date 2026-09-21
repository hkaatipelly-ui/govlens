import { NextResponse } from "next/server";
import { checkOllamaHealth } from "@/lib/ai/OllamaGemmaEngine";

/**
 * GET /api/health — local-AI + backend status for the portal banner.
 * Superset shape: new canonical fields + legacy `ok/detail` for older clients.
 */
export async function GET() {
  const health = await checkOllamaHealth();
  const detail = !health.ollama
    ? "Ollama is not reachable at localhost:11434. Start it with `ollama serve`."
    : !health.modelAvailable
      ? `Ollama is running but model "${health.model}" is missing. Run: ollama pull ${health.model}`
      : "Local AI ready.";
  return NextResponse.json({
    status: health.status,
    ollama: health.ollama,
    modelAvailable: health.modelAvailable,
    model: health.model,
    // legacy aliases
    ok: health.status === "ok",
    detail,
  });
}
