# GovLens — New Architecture Plan (NOT implemented)

> Planning document only. The working baseline is frozen in
> `docs/CURRENT_ARCHITECTURE.md` (commit `04ad348`). Implement behind the
> existing UI: same pages, same API shapes (extended, never broken), same
> SQLite/Ollama/Gemma stack unless a section explicitly justifies otherwise.

## 0. Guiding constraints

- Frontend pages/components unchanged; new intelligence surfaces through
  existing sections (DOCUMENT CHECK, facts, Q&A, caseworker detail) or new
  additive sections only.
- One normalized pipeline for all formats (extend `NormalizedDocument`,
  don't fork per format). No cloud AI. No new backend framework.
- Every AI claim keeps `sourceIds` + grounded/unverified semantics.

## 1. Document classification (extend verification service)

Add a first-pass classifier producing
`{category, subType, confidence, reasons}` where category ∈
`government-notice | application-form | certificate | receipt |
land-record | court-record | fir | identity | private | unknown`.
Implementation: extend `lib/verification/` with a classification prompt +
keyword priors from the corpus; reuse the existing A–F stage runner.
Later-modified files: `lib/verification/*`, `lib/verification/schemas.ts`,
verification section of `POST /api/analyze`.

## 2. Normalized document representation (extend, don't replace)

Extend `NormalizedDocument` with: `pages[].{blocks,tables}`,
`languageConf`, `docHash` (sha256 for dedupe/cache), `classification`.
Add a server-side `lib/documents/NormalizedDocument.ts` type + normalizer
so routes share one contract. Files to modify later:
`app/lib/ingestion.ts` (client capture), new `lib/documents/*`.

## 3. Entity extraction

New `lib/analysis/entities.ts` + Zod schema:
persons, organizations, dates, amounts, addresses, IDs/reference numbers,
contact details — each `{value, pageRef, confidence}`. Deterministic
verbatim post-pass (existing `lib/extraction/postprocess.ts` pattern)
fills model-conservative nulls. Feeds chronology, contradiction, eligibility.

## 4. Claim extraction

New `lib/analysis/claims.ts`: atomic checkable statements
`{id, text, pageRef, entities[], needsEvidence: boolean}`. Claims are the
unit that verification, evidence matching, and contradiction detection
operate on — not raw prose.

## 5. Evidence extraction

New `lib/analysis/evidence.ts`: for each claim, retrieve corpus passages
(`KnowledgeEngine`, extended with claim-keyed search) → `{claimId,
chunkIds, verdict: supported|contradicted|unverifiable}`. Reuses
`SourceService` provenance; never fabricates sources.

## 6. 9W+H question generation

New `lib/analysis/questions.ts`: generate Who/What/When/Where/Why/Which/
Whom/Whose/How (+How-much/How-long) per document from claims+entities.
Powers guided Q&A suggestions and caseworker review checklists. Same
grounded pipeline; suggested questions route through existing `/api/ask`.

## 7. Deep analysis

New `lib/analysis/deepAnalysis.ts` orchestrator producing
`DeepAnalysis {summary, claims[], entities[], chronology, contradictions[],
risks[], eligibilityNotes[], sourceIds[]}` — one additional Gemma call with
JSON-schema format, cached per session (`analysis_json` extension), Q&A
reuses the cache (no re-analysis per question, per existing efficiency rule).

## 8. Verification (extend existing, don't replace)

Keep stages A–F + status vocabulary. Add: claim-level verdicts (§5),
document-hash allow/deny notes, mismatch signals (org vs contact, seal-only
evidence). Files: `lib/verification/*` only.

## 9. Government scheme eligibility

New `lib/analysis/eligibility.ts`: rule-first checker (extract scheme
criteria from corpus chunks as structured rules) + Gemma explainer.
Output `{schemeId, eligible: yes|no|unknown, metCriteria[], unmetCriteria[],
missingDocuments[]}`. Never claims official determination — always
"AI-assisted, confirm at counter".

## 10. Land/property verification

New `lib/analysis/landRecords.ts`: survey-number/khata/owner/extent
extraction with cross-field consistency checks (area units, owner-name
agreement across pages), matched against Dharani-type corpus entries.
Flags mutation/registration next steps via existing ActionEngine.

## 11. Court/FIR analysis

New `lib/analysis/legalDocs.ts`: FIR/court-notice parsing (sections,
dates, parties, station/court, next hearing), strict "not legal advice"
disclaimer, urgency signals → caseworker priority. Same verification/Q&A
rails.

## 12. Chronology

New `lib/analysis/chronology.ts`: ordered `{date, event, pageRef,
source: document|evidence}` timeline from entities+claims. Rendered as an
additive Result-page section; stored on the session/case JSON blobs.

## 13. Contradiction detection

New `lib/analysis/contradictions.ts`: pairwise claim comparison
(document-vs-document, document-vs-evidence) →
`{claimA, claimB, type, explanation, severity}`. Surfaces in DOCUMENT CHECK
warnings and caseworker Verification Signals. Deterministic rules first
(date/amount/name mismatches), Gemma adjudication second.

## 14. Action/checklist engine (extend existing)

Extend `lib/actions/ActionEngine.ts` (keep rule-based core): consume
claims/deadlines/eligibility gaps → checklist + reminders + document list;
AI `generateActionPlan` remains the enrichment layer with rule fallback.
No auto-filing of government forms, ever.

## 15. Source/evidence traceability (extend existing)

Every new artifact (claim, entity, timeline event, eligibility line)
carries `{sourceIds, pageRefs}`. Extend `SourceService` with page-anchored
passages; UI shows existing badges/panels (no redesign).

## 16. Multi-user data isolation (already implemented — extend carefully)

Current: `owner_id` scoping + `govlens_user_id` HttpOnly cookies +
caseworker code gate (`lib/auth/identity.ts`). New tables/columns MUST
include `owner_id` from day one; new routes MUST scope by cookie identity
or caseworker session; add regression tests per feature (mirror
`tests/backend.test.ts` patterns).

## 17. Proposed implementation order (later)

1. NormalizedDocument v2 + docHash cache
2. Entities → claims → evidence (the core spine)
3. Classification + verification extensions
4. Chronology + contradictions
5. Eligibility, land, legal (domain packs, independent)
6. 9W+H + deep-analysis orchestrator
7. Action engine + traceability UI additions
8. Isolation regression tests throughout

## 18. Risks

- Local Gemma latency multiplies with new calls: budget calls per document
  (fuse prompts, cache aggressively, keep `num_predict` caps).
- Scope creep into legal advice or authenticity claims: keep disclaimers and
  the `likely_government` cap.
- Schema drift across many Zod models: single `lib/analysis/schemas.ts`.
- Frontend preservation: all new output must fit existing sections/patterns;
  any UI addition needs explicit approval first.
