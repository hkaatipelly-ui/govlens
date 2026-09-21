import { NextResponse } from "next/server";
import { parseOrError, createCaseRequestSchema } from "@/lib/validation/apiSchemas";
import { getSessionService } from "@/lib/sessions/SessionService";
import { getCaseService } from "@/lib/cases/CaseService";
import { getKnowledgeEngine } from "@/lib/knowledge/LocalKnowledgeEngine";
import { getActionEngine } from "@/lib/actions/ActionEngine";
import { getAIEngine } from "@/lib/ai/OllamaGemmaEngine";
import { validateExtractionJson } from "@/lib/extraction/schemas";

/**
 * GET /api/cases — list all cases (newest first).
 * POST /api/cases — create from a session ({ sessionId }) or a full legacy
 * payload ({ documentText, analysis, evidence, checklist, language }).
 */
export async function GET() {
  try {
    return NextResponse.json({ cases: getCaseService().list() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not list cases." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request: body must be JSON." }, { status: 400 });
  }
  const parsed = parseOrError(createCaseRequestSchema, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 });

  try {
    const raw = body as Record<string, unknown>;
    const sessions = getSessionService();
    const cases = getCaseService();

    // Path A: canonical — build from a stored session.
    if (parsed.data.sessionId) {
      const session = sessions.get(parsed.data.sessionId);
      if (!session || !session.extraction) {
        return NextResponse.json(
          { error: "Unknown or unanalyzed session. Analyze the document first." },
          { status: 400 }
        );
      }
      const kb = getKnowledgeEngine();
      const evidence = await kb.search(session.documentText, 3);
      const checklist = getActionEngine().buildChecklist(session.extraction, evidence);
      // AI action plan enriches the checklist (falls back to rule-based on failure).
      try {
        const plan = await getAIEngine().generateActionPlan({
          extraction: session.extraction,
          evidence,
        });
        const seen = new Set(checklist.map((c) => c.label.toLowerCase()));
        plan.actions.forEach((a, i) => {
          if (!seen.has(a.title.toLowerCase())) {
            checklist.push({
              id: `ai-${i + 1}`,
              label: a.title,
              detail: a.detail || undefined,
              sourceId: plan.sourceIds[0],
              done: false,
            });
          }
        });
      } catch {
        /* rule-based checklist stands on its own */
      }
      const history = sessions.history(session.id);
      const created = cases.create({
        sessionId: session.id,
        title: parsed.data.title,
        language: parsed.data.language ?? session.language,
        originalText: session.documentText,
        extraction: session.extraction,
        evidence,
        checklist,
        verification: session.verification,
        explanation: session.explanation,
        qa: history
          .filter((m) => m.role === "user")
          .map((m, i) => {
            const reply = history.filter((h) => h.role === "assistant")[i];
            return { q: m.content, a: reply?.content ?? "", grounded: reply?.grounded ?? false };
          }),
      });
      return NextResponse.json({ case: created }, { status: 201 });
    }

    // Path B: legacy full payload from older clients.
    const legacy = raw as {
      documentText?: unknown;
      analysis?: unknown;
      evidence?: unknown;
      checklist?: unknown;
      language?: unknown;
    };
    if (typeof legacy.documentText !== "string" || !legacy.documentText.trim() || !legacy.analysis) {
      return NextResponse.json(
        { error: "Case needs sessionId, or documentText + analysis." },
        { status: 400 }
      );
    }
    // Map the legacy analysis shape onto the canonical extraction.
    const a = legacy.analysis as Record<string, unknown>;
    const ef = (a.extractedFields ?? {}) as Record<string, unknown>;
    const strArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
    const canonical = validateExtractionJson(
      JSON.stringify({
        documentType: typeof a.documentType === "string" ? a.documentType : "Government document",
        title: null,
        organization: typeof ef.officeOrDepartment === "string" ? ef.officeOrDepartment : null,
        summary: typeof a.summary === "string" ? a.summary : "No summary available.",
        summaryTelugu: typeof a.summaryTelugu === "string" ? a.summaryTelugu : undefined,
        deadline: Array.isArray(ef.deadlines) && typeof ef.deadlines[0] === "string" ? ef.deadlines[0] : null,
        amount: Array.isArray(ef.amounts) && typeof ef.amounts[0] === "string" ? ef.amounts[0] : null,
        referenceNumber: typeof ef.applicationId === "string" ? ef.applicationId : null,
        requiredDocuments: strArr(ef.requiredDocuments),
        requiredActions: [],
        warningSignals: [],
        language: typeof a.language === "string" ? a.language : "en",
        sourceIds: Array.isArray(a.sources)
          ? (a.sources as Array<{ id?: unknown }>).map((s) => String(s.id)).filter(Boolean)
          : [],
      })
    );
    if (!canonical) {
      return NextResponse.json({ error: "Invalid analysis payload." }, { status: 400 });
    }
    const legacyEvidence = Array.isArray(legacy.evidence) ? legacy.evidence : [];
    const mappedEvidence = legacyEvidence
      .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
      .map((e, i) => ({
        chunkId: String(e.chunkId ?? `legacy-${i}`),
        documentId: String(e.sourceId ?? e.documentId ?? "unknown"),
        content: String(e.text ?? e.content ?? ""),
        sourceMetadata: {
          id: String(e.sourceId ?? e.documentId ?? "unknown"),
          title: String(e.title ?? "Unknown source"),
          department: String(e.department ?? ""),
          state: "",
          documentType: "",
          language: "en",
          sourceUrl: "",
          publishedDate: "",
          effectiveDate: "",
          lastVerified: "",
        },
        score: typeof e.score === "number" ? e.score : 0,
        matchedTerms: Array.isArray(e.matchedTerms) ? e.matchedTerms.filter((x): x is string => typeof x === "string") : [],
      }));
    const created = cases.create({
      sessionId: `legacy-${Date.now()}`,
      language:
        parsed.data.language ??
        (typeof legacy.language === "string" ? legacy.language : undefined) ??
        canonical.language,
      originalText: legacy.documentText.trim(),
      extraction: canonical,
      evidence: mappedEvidence,
      checklist: Array.isArray(legacy.checklist)
        ? (legacy.checklist as Array<Record<string, unknown>>).map((c, i) => ({
            id: String(c.id ?? `item-${i}`),
            label: String(c.label ?? "Step"),
            detail: typeof c.detail === "string" ? c.detail : undefined,
            sourceId: typeof c.sourceId === "string" ? c.sourceId : undefined,
            done: c.done === true,
          }))
        : [],
    });
    return NextResponse.json({ case: created }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create case." },
      { status: 500 }
    );
  }
}
