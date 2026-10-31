# GovLens Public Grievance — Final Report

Date: 2026-10-27. Repository root: `/Users/havishkaatipelly/Desktop/MY FILES/BRAVE/sample90`. Baseline commit `e99d0bd`; all changes are uncommitted (no reset/discard performed).

## 1. Features reused from the original project
- Existing routes: `/api/ask`, `/api/cases`, `/order`-style session/auth identity (`getOrCreateUserId`, anonymous cookie), `isOwner`, `requireOwnerLocalAI`.
- CaseService case storage unchanged; grievance records are a separate additive entity.
- Caseworker access remains the existing cookie-based gate (`isCaseworker`) on the server.
- Knolwedge retrieval (`KnowledgeEngine.search`, chunk ranking) reused for public Q&A.
- UI components reused: `PortalProvider` language selection, `VoiceInput`, `VoiceOutput`, `StatusBadge`, `gov-*` classes.
- DB conventions: additive `CREATE TABLE IF NOT EXISTS`, app-level migrations.

## 2. Features implemented per phase
- Phase 1: gap audit in `docs/GOVLENS_PUBLIC_GRIEVANCE_GAP_ANALYSIS.md`.
- Phase 2: Gemini adapter via `@google/genai`, owner auth, provider policy, privacy screen, `/owner` sign-in, secured `/api/cases` AI enrichment, health, mocked tests.
- Phase 3: 20-entry service directory (15 official, 2 secondary_unverified, 3 sample), SSG detail pages, search/filter, KB integration with provenance.
- Phase 4: grounded public-service Q&A retrieval + answer contract (`answer, intent, supported, limitations, sources[]`), injection-resistant prompt, no/low evidence states, conflict acknowledgement, sanitisation, `/services` Q&A card.
- Phase 5: grievance persistence (`grievances` + `grievance_status_history`), crypto reference numbers, status state machine, owner-scoped APIs, validation, idempotency keys.
- Phase 6: citizen form + review/confirm + dashboard + detail/history timeline + disclosure disclaimer.
- Phase 7: staff queue, protected caseworker review queue APIs, status-update API with audit history, summary analytics, optional duplicate-record warning, documentation.

## 3. Features still missing
- No genuine external government submission integration (by design; explicit disclosure required).
- No attachment storage/upload pipeline for grievances (metadata only).
- No dedicated staff account store; staff identity is the caseworker cookie plus an anonymous owner user UUID.
- No real CAPTCHA beyond idempotency/length limits.
- On-demand analytics are simple aggregates; no charts.

## 4. Files changed (phase-related)
Created: `lib/qa/publicServiceQa.ts`, `lib/grievances/GrievanceService.ts`, `app/api/grievances/*`, `app/api/caseworker/grievances/*`, `app/grievances/*`, `app/components/PublicAskCard.tsx`, `tests/public-service-qa.test.ts`, `tests/grievance-backend.test.ts`, this report.
Modified: `app/api/ask/route.ts`, `lib/ai/*`, `lib/ai/geminiPrivacy.ts`, `lib/ai/providerPolicy.ts`, `lib/extraction/schemas.ts`, `lib/db/migrations.ts`, `lib/validation/apiSchemas.ts`, `app/services/page.tsx`, `app/services/api.ts`, and others from earlier phases.

## 5. Database migrations and results
Additive only. New `grievances` and `grievance_status_history` tables plus indexes and owner-scoped idempotency index. No existing tables deleted; existing cases remain. Migration is rerunnable through `CREATE TABLE IF NOT EXISTS` and guarded `ALTER`. In-memory and file DB tests passed. Migration verified by grievance-backend and existing suite.

## 6. AI providers configured and actually tested
- Gemini default disabled (`GEMINI_ENABLED` not true in this environment), model default `gemini-3.8-flash`, timeout/max-output defaults as implemented. No live network paid Gemini tests run; chunk/prompt logic and failures were tested with injected transports.
- Ollama is not auto-started; provider policy forbids fallback. Owner-only path exists but was not live-tested with Ollama installed.
- Mocked transport tests passed 250/250.

## 7. Gemini setup instructions (no secret values)
1. Set `GEMINI_ENABLED=true`.
2. Set `GEMINI_API_KEY=<server-side key>` in the environment.
3. Optionally set `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS`, `GEMINI_MAX_OUTPUT_TOKENS`.
4. Restart the app; only public-service questions can use it.
5. Test with `GEMINI_API_KEY=... npm run test:gemini` if quota is desired.

## 8. Manual Ollama startup instructions
1. Install Ollama separately.
2. `ollama serve`
3. `ollama pull gemma3:4b`
4. Set `OWNER_ACCESS_CODE` to at least 8 characters.
5. Sign in at `/owner`, then use document-scoped Q&A.
6. Health checks never start Ollama.

## 9. Service directory entry count
20 entries (15 official, 2 secondary_unverified, 3 sample). Five older sources intentionally retained with dead/unconfirmed links and conflict notes rather than silently changed.

## 10. Sample-data limitations
Three services are clearly labelled sample records without official links/review dates. Two services (Dharani, PM-KISAN) carry secondary_unverified classification because portal access could not be confirmed; links/review dates are honest. Fees, deadlines, eligibility and document lists may be absent wherever the source did not state them.

## 11. External government integration
None. No request is transmitted to any government system. Public Q&A uses curated local records only; Gemini only receives non-sensitive public excerpts when enabled. Every grievance carries the demonstration/tracking-only disclaimer.

## 12. Security-test results
- Chemistry-level unit/API tests verify ownership isolation, private-note exclusion, invalid transitions, schema bounds, attempted injection.
- Caseworker routes require the server-side cookie gate; unauthenticated `GET` returns 403.
- Citizen APIs never expose internal notes.
- Sensitive prompts are blocked before Gemini transmission.
- No live multi-identity automated end-to-end security suite was run; live black-box security depends on cookie handling and was exercised in targeted API smoke checks.

## 13. Frontend regressions found/fixed
No changes to original branding/navigation/layout. New elements (Q&A card, grievance pages, caseworker links) are additive. Build and lint clean.

## 14. Lint/typecheck/test/build results
- Lint: pass (`✔ No ESLint warnings or errors`).
- Typecheck: pass (`tsc --noEmit`).
- Unit/integration tests: `250/250` files pass? 21 test files, 250 tests pass.
- Production build: pass.

## 15. Known bugs and reproduction steps
- Anonymous user identity is cookie-based; API smoke with no cookie jar creates a different anonymous user each request, so cross-request checks must retain the response cookie (use `--cookie-jar`).
- Caseworker queue actor ID records the requesting browser's anonymous user UUID as `actor_id`; role is set to `caseworker`, but the audit actor is not a distinct authenticated staff account.
- Five pre-existing service deep links return HTTP 404 (flagged, left visible with conflict notes).
- Idempotency keys are client-supplied strings; if not provided, duplicate submissions within the same network retry may not dedupe. (Phase 6 adds client-side loading guard as mitigation.)
- Duplicate warning uses only the caller's prior unresolved grievances to avoid privacy exposure; it does not inspect other citizens' records.
- Build may need Node with available `node:sqlite`; this environment supports it.

## Cleanest safe next steps
1. `npm install` (already installed).
2. `npm run typecheck && npm run lint && npm test && npm run build`.
3. Run locally with `npm run dev`, set `OWNER_ACCESS_CODE`, sign in at `/owner`.
4. Citizen flow: `/services` → Q&A or `/grievances` → submit grievance → dashboard → `/grievances/[id]`.
5. Enable Gemini by setting `GEMINI_ENABLED=true` and a server-side `GEMINI_API_KEY`.
6. Start Ollama only manually for owner document Q&A when needed.
7. Next engineering work: fix dead service deep links and replace the caseworker cookie model with distinct staff credentials.
No destructive Git commands were used. Done with Phase 7; no Phase 8 started.
PY