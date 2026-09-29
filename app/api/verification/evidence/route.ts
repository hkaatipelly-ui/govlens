import { NextResponse } from "next/server";
import { parseOrError } from "@/lib/validation/apiSchemas";
import { userEvidenceSchema } from "@/lib/verification/external-schemas";
import { verifyWithUserEvidence, ensureAdapters } from "@/lib/verification/pipeline";
import { getVerificationStore } from "@/lib/verification/store";
import { getOrCreateUserId } from "@/lib/auth/identity";
import { getDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import { z } from "zod";

const requestSchema = userEvidenceSchema.extend({
  sessionId: z.string().trim().min(1).max(128).optional(),
});

/**
 * POST /api/verification/evidence — user-assisted verification.
 * The citizen pastes official values they looked up (via the adapter's
 * instructions + source link); the server normalizes, compares against the
 * document claim, persists the result owner-scoped, and returns the report.
 * Document must belong to the caller, else 404. No automated portal access.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request: body must be JSON." }, { status: 400 });
  }
  const parsed = parseOrError(requestSchema, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 });

  try {
    ensureAdapters();
    const ownerId = getOrCreateUserId();
    const db = getDatabase();
    migrate(db);
    const docRow = db
      .prepare(`SELECT id FROM analysis_documents WHERE id = ? AND owner_id = ?`)
      .get(parsed.data.documentId, ownerId) as { id: string } | undefined;
    if (!docRow) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }
    const claimRow = parsed.data.claimId
      ? (db
          .prepare(`SELECT claim_text AS claimText, id AS claimDbId FROM document_claims WHERE document_id = ? AND owner_id = ? AND id = ?`)
          .get(parsed.data.documentId, ownerId, parsed.data.claimId) as
          | { claimText: string; claimDbId: string }
          | undefined)
      : (db
          .prepare(`SELECT claim_text AS claimText, id AS claimDbId FROM document_claims WHERE document_id = ? AND owner_id = ? ORDER BY rowid ASC LIMIT 1`)
          .get(parsed.data.documentId, ownerId) as
          | { claimText: string; claimDbId: string }
          | undefined);
    const claim = {
      claimId: claimRow?.claimDbId ?? parsed.data.claimId ?? `${parsed.data.documentId}-manual`,
      subject: "",
      predicate: "",
      object: "",
      claimText: claimRow?.claimText ?? Object.values(parsed.data.fields).join("; ").slice(0, 1000),
      sourcePage: 1,
      sourceText: "",
      confidence: 0.5,
      materiality: "medium" as const,
      verificationStatus: "extracted" as const,
      evidenceIds: [] as string[],
    };
    const results = verifyWithUserEvidence(claim, parsed.data, { evidenceId: "" });
    getVerificationStore().saveResults(ownerId, parsed.data.documentId, results);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Verification failed." },
      { status: 500 }
    );
  }
}
