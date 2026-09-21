/**
 * GovernmentDocumentVerificationService — multi-stage AI-assisted verification.
 *
 * STAGE A: document-type classification (Gemma, text)
 * STAGE B: content-based government likelihood (same call)
 * STAGE C: visual assessment (Gemma vision, only when an image is provided)
 * STAGE D: knowledge-base retrieval (caller provides hits)
 * STAGE E: official-source matching (strong match required for "verified")
 * STAGE F: final classification merge
 *
 * Hard rule: "verified" ONLY with exact/strong official-source evidence.
 * Content/visual clues alone cap at "likely_government". This service never
 * claims authentication — only AI-assisted likelihood + source matching.
 */
import type { AIEngine } from "../ai/AIEngine";
import type { KnowledgeHit } from "../knowledge/KnowledgeEngine";
import {
  uncertainVerificationFallback,
  type Verification,
} from "./schemas";

export interface VerificationInput {
  ocrText: string;
  language?: string;
  imageDataUrl?: string;
  evidence?: KnowledgeHit[];
}

const STRONG_MATCH_SCORE = 8;

export class GovernmentDocumentVerificationService {
  constructor(private readonly engine: AIEngine) {}

  async verify(input: VerificationInput, precomputedBase?: Verification): Promise<Verification> {
    // STAGES A+B (+C when an image is supplied), unless the caller already ran them.
    const base =
      precomputedBase ??
      (await this.engine.verifyGovernmentDocument({
        ocrText: input.ocrText,
        language: input.language ?? "en",
        imageDataUrl: input.imageDataUrl,
      }));

    const evidence = input.evidence ?? [];

    // STAGE D+E: official-source matching. Strong match = top hit score AND
    // the document text shares distinctive terms with the source.
    const strong = this.findStrongMatch(input.ocrText, evidence);
    const reasons = [...base.reasons];
    const warnings = [...base.verificationWarnings];
    const matchedSources = evidence.slice(0, 3).map((h) => h.documentId);

    if (strong) {
      return {
        ...base,
        status: "verified",
        confidence: Math.min(0.95, Math.max(base.confidence, 0.85)),
        matchedSources,
        reasons: [
          ...reasons,
          `Strong match with official source "${strong.sourceMetadata.title}".`,
        ],
        verificationWarnings: warnings,
      };
    }

    // No strong match: cap the status. Content/visual clues alone can never
    // declare a document officially authentic.
    if (base.status === "verified") base.status = "likely_government";
    if (evidence.length === 0 && base.status === "likely_government") {
      warnings.push(
        "No matching official source was found in the GovLens knowledge base."
      );
    }
    if (base.status === "likely_government") {
      reasons.push(
        "Content is consistent with government/public-service material, but GovLens does not independently authenticate the physical document."
      );
    }
    return {
      ...base,
      matchedSources,
      verificationWarnings: warnings,
    };
  }

  private findStrongMatch(ocrText: string, evidence: KnowledgeHit[]): KnowledgeHit | null {
    if (evidence.length === 0) return null;
    const top = evidence[0];
    if (top.score < STRONG_MATCH_SCORE) return null;
    // Distinctive overlap: at least 2 matched terms beyond generic words.
    const distinctive = top.matchedTerms.filter((t) => t.length > 4);
    if (distinctive.length < 2) return null;
    const hay = ocrText.toLowerCase();
    const overlap = distinctive.filter((t) => hay.includes(t)).length;
    return overlap >= 2 ? top : null;
  }
}

export { uncertainVerificationFallback };
