import { NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/auth/identity";
import { getSessionService } from "@/lib/sessions/SessionService";
import { getAnalysisStore } from "@/lib/analysis/store";
import { getSourceService } from "@/lib/sources/SourceService";
import { assembleReport } from "@/lib/analysis/assembler";
import { getDatabase } from "@/lib/db/database";

/**
 * GET /api/analysis/report?sessionId= — structured DocumentIntelligenceReport
 * assembled deterministically from persisted owner-scoped artifacts.
 * No model calls. Unknown/foreign sessions → 404.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId") ?? "";
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
    }
    const ownerId = getOrCreateUserId();
    const session = getSessionService().get(sessionId, ownerId);
    if (!session || !session.extraction) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }
    const db = getDatabase();
    const docRow = db
      .prepare(`SELECT id FROM analysis_documents WHERE session_id = ? AND owner_id = ?`)
      .get(sessionId, ownerId) as { id: string } | undefined;
    const store = getAnalysisStore();
    const bundle = docRow ? store.readBundle(docRow.id, ownerId) : null;
    const sources = await getSourceService().getSources(session.extraction.sourceIds);
    const report = assembleReport({
      bundle,
      session: {
        sessionId: session.id,
        fileName: session.fileName,
        language: session.language,
        extraction: {
          documentType: session.extraction.documentType,
          title: session.extraction.title,
          summary: session.extraction.summary,
          deadline: session.extraction.deadline,
          amount: session.extraction.amount,
          referenceNumber: session.extraction.referenceNumber,
          requiredDocuments: session.extraction.requiredDocuments,
          requiredActions: session.extraction.requiredActions,
          warningSignals: session.extraction.warningSignals,
        },
        explanation: session.explanation
          ? { verificationNote: session.explanation.verificationNote ?? "" }
          : null,
      },
      sources: sources.map((s) => ({ id: s.id, title: s.title, department: s.department })),
      checklist: (session.extraction.requiredActions ?? []).map((label) => ({
        label,
        detail: undefined,
        done: false,
      })),
    });
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not assemble report." },
      { status: 500 }
    );
  }
}
