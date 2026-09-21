import { parseOrError, analyzeRequestSchema } from "@/lib/validation/apiSchemas";
import { getSessionService } from "@/lib/sessions/SessionService";
import { getKnowledgeEngine } from "@/lib/knowledge/LocalKnowledgeEngine";
import { getAIEngine, AIEngineUnavailableError, AITimeoutError } from "@/lib/ai/OllamaGemmaEngine";
import { GovernmentDocumentVerificationService } from "@/lib/verification/GovernmentDocumentVerificationService";
import { getActionEngine } from "@/lib/actions/ActionEngine";
import { fillExtractionGaps, ensureExplanation } from "@/lib/extraction/postprocess";
import { getSourceService } from "@/lib/sources/SourceService";

/**
 * POST /api/analyze — full AI pipeline with honest server-sent progress:
 *   cleanup (Gemma) → verify type (Gemma A+B) → retrieve (KnowledgeEngine)
 *   → vision verify (Gemma image, if provided) + extract → explain.
 *
 * Events: {stage} … {done: payload} | {error, code}.
 * ONE request; no polling; every stage event reflects real completed work.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request: body must be JSON." }, { status: 400 });
  }
  const parsed = parseOrError(analyzeRequestSchema, body);
  if (!parsed.ok) return Response.json({ error: parsed.message }, { status: 400 });
  const { text, language, sessionId: requestedSession, imageDataUrl, fileName, fileType } = parsed.data;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`));
      const fail = (error: string, code?: string, status = 500) => {
        send({ error, code, status });
        controller.close();
      };
      try {
        const sessions = getSessionService();
        const session = sessions.create({
          documentText: text,
          language,
          sessionId: requestedSession,
          fileName: fileName ?? undefined,
          fileType: fileType ?? undefined,
        });

        // 1. OCR cleanup + normalization (Gemma).
        send({ stage: "reading", label: "Reading document" });
        const engine = getAIEngine();
        const cleanup = await engine.cleanupOcrText({ rawText: text });
        const cleaned = cleanup.cleanedText || text;
        sessions.saveDocument(session.id, {
          rawText: text,
          cleanedText: cleaned,
          language: cleanup.language,
          confidence: cleanup.confidence,
        });

        // 2a. Type check (stages A+B) and 2b. retrieval — independent, in parallel.
        send({ stage: "checking-type", label: "Checking document type" });
        const kb = getKnowledgeEngine();
        const verifier = new GovernmentDocumentVerificationService(engine);
        const [textVerification, evidence] = await Promise.all([
          engine.verifyGovernmentDocument({ ocrText: cleaned, language }),
          kb.search(cleaned, 3),
        ]);
        send({ stage: "finding-info", label: "Finding official information" });

        // 3. Vision assessment (stage C, only with image) + structured extraction — parallel.
        send({ stage: "understanding", label: "Understanding document" });
        const [vision, rawExtraction] = await Promise.all([
          imageDataUrl
            ? engine
                .verifyGovernmentDocument({ ocrText: cleaned, language, imageDataUrl })
                .catch(() => null)
            : Promise.resolve(null),
          engine.extractDocumentFields({ text: cleaned, language, evidence }),
        ]);
        // Deterministic verbatim post-pass (fills model-conservative nulls from the document).
        const extraction = fillExtractionGaps(rawExtraction, cleaned);

        // 4. Stages D+E+F: merge retrieval evidence into final verification.
        const verification = await verifier.verify(
          { ocrText: cleaned, language, evidence },
          textVerification
        );
        // Fold vision signals in (weak signals only, never proof).
        if (vision && vision.visualSignals.length) {
          verification.visualSignals = [
            ...verification.visualSignals,
            ...vision.visualSignals,
          ];
          verification.verificationWarnings.push(...vision.verificationWarnings);
          if (vision.organization && !verification.organization) {
            verification.organization = vision.organization;
          }
        }

        // 5. Grounded explanation (Gemma). A timeout here degrades gracefully:
        // the deterministic extraction-based explanation stands in.
        send({ stage: "explaining", label: "Preparing explanation" });
        let explanation;
        try {
          const raw = await engine.explainDocument({
            text: cleaned,
            extraction,
            evidence,
            language,
          });
          explanation = ensureExplanation(raw, extraction, evidence.map((h) => h.documentId));
        } catch (err) {
          if (err instanceof AITimeoutError) {
            explanation = {
              summary: extraction.summary,
              importantPoints: extraction.requiredDocuments
                .slice(0, 3)
                .map((d) => `Document needed: ${d}`),
              whatToDo: extraction.requiredActions.slice(0, 5),
              deadline: extraction.deadline ?? "",
              amount: extraction.amount ?? "",
              verificationNote:
                "The detailed explanation timed out — showing extracted facts. Retry for the full explanation.",
              sourceIds: evidence.map((h) => h.documentId),
            };
          } else {
            throw err;
          }
        }

        sessions.saveAnalysis(session.id, extraction, extraction.sourceIds, verification, explanation);

        const checklist = getActionEngine().buildChecklist(extraction, evidence);
        const sources = await getSourceService().getSources(extraction.sourceIds);
        const grounded = evidence.length > 0;

        send({
          done: true,
          extraction,
          explanation,
          verification,
          cleanedText: cleaned,
          sources,
          sessionId: session.id,
          checklist,
          grounded,
          // legacy aliases
          analysis: {
            documentType: extraction.documentType,
            language: extraction.language,
            summary: extraction.summary,
            summaryTelugu: extraction.summaryTelugu,
            extractedFields: {
              documentType: extraction.documentType,
              applicationId: extraction.referenceNumber ?? undefined,
              dates: extraction.deadline ? [extraction.deadline] : [],
              amounts: extraction.amount ? [extraction.amount] : [],
              requiredDocuments: extraction.requiredDocuments,
              deadlines: extraction.deadline ? [extraction.deadline] : [],
              officeOrDepartment: extraction.organization ?? undefined,
            },
            sources: sources.map((s) => ({ id: s.id, title: s.title, department: s.department })),
            verified: grounded,
          },
          evidence: evidence.map((h) => ({
            sourceId: h.documentId,
            title: h.sourceMetadata.title,
            department: h.sourceMetadata.department,
            text: h.content,
            score: h.score,
            matchedTerms: h.matchedTerms,
          })),
        });
        controller.close();
      } catch (err) {
        if (err instanceof AIEngineUnavailableError) {
          fail(err.message, "AI_UNAVAILABLE", 503);
        } else {
          fail(err instanceof Error ? err.message : "Analysis failed.");
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
