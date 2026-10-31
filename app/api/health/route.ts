import { NextResponse } from "next/server";
import { checkGeminiHealth } from "@/lib/ai/GeminiEngine";
 
// Health must reflect the CURRENT providers, not a build-time snapshot.
export const dynamic = "force-dynamic";

/**
 * GET /api/health — Gemini provider status for the portal banner.
 */
export async function GET() {
  const gemini = checkGeminiHealth();
  const detail = gemini.ok
    ? "Google Gemini ready."
    : gemini.configured
      ? gemini.detail
      : "Google Gemini is not configured.";
  return NextResponse.json({
    status: gemini.ok ? "ok" : "degraded",
    ollama: false,
    modelAvailable: gemini.configured,
    model: gemini.model,
    gemini: {
      configured: gemini.configured,
      enabled: gemini.enabled,
      model: gemini.model,
      ok: gemini.ok,
      lastOutcome: gemini.lastOutcome,
      lastErrorKind: gemini.lastErrorKind,
      detail: gemini.detail,
    },
    // legacy aliases
    ok: gemini.ok,
    detail,
  });
}
