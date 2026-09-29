import { parseOrError, analyzeRequestSchema } from "@/lib/validation/apiSchemas";
import { getSessionService } from "@/lib/sessions/SessionService";
import { getKnowledgeEngine } from "@/lib/knowledge/LocalKnowledgeEngine";
import { getAIEngine, AIEngineUnavailableError, AITimeoutError } from "@/lib/ai/OllamaGemmaEngine";
import { GovernmentDocumentVerificationService } from "@/lib/verification/GovernmentDocumentVerificationService";
import { getActionEngine } from "@/lib/actions/ActionEngine";
import { fillExtractionGaps, ensureExplanation } from "@/lib/extraction/postprocess";
import { getOrCreateUserId } from "@/lib/auth/identity";
import { getSourceService } from "@/lib/sources/SourceService";
import { buildNormalizedDocument } from "@/lib/documents/normalized";
import { classifyDocument, extractEntities, extractClaims, buildEvidence } from "@/lib/analysis/foundation";
import { buildQuestionGraph, buildChronology, detectContradictions } from "@/lib/analysis/deep";
import { getAnalysisStore } from "@/lib/analysis/store";
import { routeClaims, ensureAdapters } from "@/lib/verification/pipeline";
import { listAdapters } from "@/lib/verification/adapters";
import { getVerificationStore } from "@/lib/verification/store";
import {
  isSchemeLike,
  extractScheme,
  buildEligibilityMatrix,
  buildChecklist as buildSchemeChecklist,
} from "@/lib/analysis/scheme";
import {
  isLegalLike,
  extractLegalHeader,
  buildPartyGraph,
  extractProvisions,
  buildClaimEvidenceMatrix,
  buildRelationships,
} from "@/lib/analysis/legal";
import { getLegalStore } from "@/lib/analysis/legal-store";
import type { ClaimRoute } from "@/lib/verification/pipeline";

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
        const ownerId = getOrCreateUserId();
        const session = sessions.create({
          documentText: text,
          language,
          sessionId: requestedSession,
          fileName: fileName ?? undefined,
          fileType: fileType ?? undefined,
          ownerId,
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
        }, ownerId);

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

        sessions.saveAnalysis(session.id, extraction, extraction.sourceIds, verification, explanation, ownerId);

        // Analysis foundation (deterministic, no extra model calls): normalize →
        // classify → entities → claims → evidence, persisted owner-scoped.
        // Additive only — existing pipeline output is unchanged.
        let foundation: { documentId: string; classification: string; entities: number; claims: number; evidence: number } | null = null;
        let verificationRoutes: ClaimRoute[] = [];
        try {
          const normalized = buildNormalizedDocument({
            ownerId,
            sessionId: session.id,
            sourceType: (fileType as "pdf" | "docx" | "jpeg" | "jpg" | "png" | undefined) ?? "text",
            fileName: fileName ?? null,
            language,
            text: cleaned,
          });
          const classification = classifyDocument(normalized);
          const entities = extractEntities(normalized);
          const claims = extractClaims(normalized, entities);
          const evidenceObjs = buildEvidence(
            normalized,
            claims,
            evidence.map((h) => ({
              documentId: h.documentId,
              title: h.sourceMetadata.title,
              state: h.sourceMetadata.state,
              sourceUrl: h.sourceMetadata.sourceUrl,
              content: h.content,
            }))
          );
          foundation = getAnalysisStore().saveFoundation(
            normalized,
            classification.documentType,
            entities,
            claims,
            evidenceObjs
          );
          // Verification routing (no external calls): verifiable claims →
          // adapters → user-assisted lookup requests, sources registered.
          try {
            const routes = routeClaims(normalized.documentId, claims);
            ensureAdapters();
            getVerificationStore().saveSources(
              ownerId,
              listAdapters().map((a) => ({ adapterId: a.adapterId, authority: a.authority, sourceUrl: a.sourceUrl }))
            );
            verificationRoutes = routes;
          } catch (e) {
            console.warn("[GovLens] verification routing failed (non-fatal):", e instanceof Error ? e.message : e);
          }
        } catch (e) {
          console.warn("[GovLens] foundation build failed (non-fatal):", e instanceof Error ? e.message : e);
        }

        // Deep analysis (deterministic graph/chronology/contradictions + ONE
        // structured Gemma pass for material answers). Additive; failures degrade
        // to empty deep payload without breaking the existing result.
        let deepAnalysis: { questions: number; timelineEvents: number; contradictions: number; findings: number } | null = null;
        try {
          const normalized = buildNormalizedDocument({
            ownerId,
            sessionId: session.id,
            sourceType: (fileType as "pdf" | "docx" | "jpeg" | "jpg" | "png" | undefined) ?? "text",
            fileName: fileName ?? null,
            language,
            text: cleaned,
          });
          const cls = classifyDocument(normalized);
          const ents = extractEntities(normalized);
          const clms = extractClaims(normalized, ents);
          const { roots, subquestions } = buildQuestionGraph(normalized, cls.documentType, clms, ents);
          const timeline = buildChronology(normalized, ents);
          const contradictions = detectContradictions(normalized, ents, clms);
          const material = [...roots, ...subquestions]
            .filter((q) => q.importance === "material" || q.importance === "critical")
            .slice(0, 24);
          let report;
          try {
            report = await engine.analyzeDeep({
              documentText: cleaned,
              language,
              questions: material.map((q) => ({ questionId: q.questionId, dimension: q.dimension, question: q.question })),
              evidence,
            });
          } catch (e) {
            console.warn("[GovLens] deep Gemma pass failed, storing deterministic graph only:", e instanceof Error ? e.message : e);
            report = {
              executiveSummary: "",
              answers: [],
              findings: [],
              missingInformation: [],
              verificationRequirements: [],
              unresolvedQuestions: material.map((q) => q.questionId),
            };
          }
          deepAnalysis = getAnalysisStore().saveDeep(
            normalized.documentId,
            session.id,
            ownerId,
            roots,
            subquestions,
            timeline,
            contradictions,
            report
          );
        } catch (e) {
          console.warn("[GovLens] deep analysis failed (non-fatal):", e instanceof Error ? e.message : e);
        }

        // Scheme analysis (deterministic, no extra model calls): activates for
        // scheme-like documents only. Additive; failures are non-fatal.
        let schemeAnalysis: {
          schemeName: string | null;
          requirements: number;
          satisfied: number;
          unknown: number;
          unsatisfied: number;
          missingDocuments: number;
        } | null = null;
        try {
          const normalized = buildNormalizedDocument({
            ownerId,
            sessionId: session.id,
            sourceType: (fileType as "pdf" | "docx" | "jpeg" | "jpg" | "png" | undefined) ?? "text",
            fileName: fileName ?? null,
            language,
            text: cleaned,
          });
          const cls = classifyDocument(normalized);
          if (isSchemeLike(cls.documentType, cleaned)) {
            const scheme = extractScheme(cleaned, extraction, evidence);
            const requirements = buildEligibilityMatrix(normalized.documentId, scheme, cleaned);
            const docs = buildSchemeChecklist(normalized.documentId, scheme, cleaned);
            schemeAnalysis = getAnalysisStore().saveScheme(
              normalized.documentId,
              session.id,
              ownerId,
              scheme,
              requirements,
              docs
            );
          }
        } catch (e) {
          console.warn("[GovLens] scheme analysis failed (non-fatal):", e instanceof Error ? e.message : e);
        }

        // Legal/case intelligence (deterministic, no extra model calls):
        // activates for legal-like documents only. Additive; non-fatal.
        let legalAnalysis: {
          parties: number;
          provisions: number;
          relationships: number;
          matrixEntries: number;
          bundleId: string | null;
        } | null = null;
        try {
          const normalized = buildNormalizedDocument({
            ownerId,
            sessionId: session.id,
            sourceType: (fileType as "pdf" | "docx" | "jpeg" | "jpg" | "png" | undefined) ?? "text",
            fileName: fileName ?? null,
            language,
            text: cleaned,
          });
          const cls = classifyDocument(normalized);
          if (isLegalLike(cls.documentType, cleaned)) {
            const header = extractLegalHeader(cleaned);
            const ents = extractEntities(normalized);
            const clms = extractClaims(normalized, ents);
            const parties = buildPartyGraph(normalized.documentId, cleaned, clms);
            const provisions = extractProvisions(normalized);
            const relationships = buildRelationships(normalized.documentId, cleaned);
            const matrix = buildClaimEvidenceMatrix(clms, detectContradictions(normalized, ents, clms));
            const saved = getLegalStore().saveLegal(
              normalized.documentId,
              ownerId,
              header,
              parties,
              provisions,
              relationships
            );
            saved.matrixEntries = matrix.length;
            const bundleId = getLegalStore().attachToSessionBundle(
              session.id,
              normalized.documentId,
              ownerId,
              extraction.title ?? extraction.documentType
            );
            legalAnalysis = { ...saved, bundleId };
          }
        } catch (e) {
          console.warn("[GovLens] legal analysis failed (non-fatal):", e instanceof Error ? e.message : e);
        }

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
          foundation,
          deepAnalysis,
          verificationRoutes,
          schemeAnalysis,
          legalAnalysis,
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
