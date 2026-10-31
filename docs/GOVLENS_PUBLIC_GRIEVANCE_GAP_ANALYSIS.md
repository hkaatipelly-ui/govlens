# GovLens — Public Grievance Gap Analysis & Baseline (Phase 1)

**Phase:** 1 — READ-ONLY AUDIT, GAP ANALYSIS AND BASELINE
**Date:** 2026-10-27
**Repository:** `~/Documents/MY FILES/BRAVE/sample90` (branch `main`, clean tree)
**Method:** full-repo grep + file reads + live validation commands (`test`, `typecheck`, `lint`, `build`).
**Nothing was modified.** No application code, no design, no packages, no schema, no Git operation was changed during this audit. The only file created is this report.

**Confidence key:** `[CONFIRMED]` = verified by reading the cited code or by running a command in this audit. `[UNCERTAIN]` = inferred from static reading only; runtime behaviour not observed.

---

## A. BASELINE

### A.1 Repository state (at audit start)

| Item | Value | Confidence |
|---|---|---|
| Branch | `main`, up to date with `origin/main` | CONFIRMED (`git status`) |
| Working tree | **clean — nothing to commit** | CONFIRMED (`git status`) |
| Latest commit | `e99d0bd` "Add implementation audit (verified, no app changes)" | CONFIRMED (`git log`) |
| History (last 10) | `e99d0bd, 7618d08, 7f143d9, 2fedd63, 69fffdd, 6d224c5, b5a453f, 7630a5d, a143404, 09f973a` | CONFIRMED |
| Uncommitted changes | none — no risk of overwriting user work | CONFIRMED |
| Destructive Git commands run | none | CONFIRMED |

### A.2 Project configuration

| File | Finding |
|---|---|
| `package.json` | Next.js **14.2.5**, React 18.3.1, TS 5.5.3. Deps: `next`, `react`, `react-dom`, `zod ^4.6.5`, `tesseract.js 5.1.1`, `mammoth`, `pdfjs-dist`. Dev: `vitest 3.2.4`, `eslint` + `eslint-config-next`, `tailwindcss 3.4.6`, `canvas` (PDF tests). No ORM, no auth library, no cloud-AI SDK. |
| Lockfile | `package-lock.json` present (npm). No yarn/pnpm lockfiles. `[CONFIRMED]` |
| `next.config.mjs` | Minimal: `reactStrictMode: true` only. `[CONFIRMED]` |
| `tsconfig.json` | `strict: true`, `noEmit: true`, path alias `@/* -> ./*`, includes `**/*.ts(x)`. |
| `.gitignore` | Ignores `node_modules/`, `.next/`, `.govlens-data/`, `.env`, `.env.local`, `.env.*.local`, `*.pem`, `*.key`, key patterns. **User data and env files are not in Git.** `[CONFIRMED]` |
| Env examples | `.env.example` (23 lines) and `deploy/env.production.example`. Vars: `NEXT_PUBLIC_APP_URL`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT_MS`, `OLLAMA_NUM_PREDICT`, `DATABASE_PATH`, `CASEWORKER_ACCESS_CODE`. **No secret values committed.** `[CONFIRMED]` |
| Database config | `lib/db/database.ts` — Node built-in `node:sqlite` (`DatabaseSync`), file at `process.env.DATABASE_PATH ?? ./.govlens-data/govlens.db`, `mkdirSync` of parent dir. No external DB. `[CONFIRMED]` |
| Migrations | `lib/db/migrations.ts` — single idempotent `migrate(db)`, `SCHEMA_VERSION = 1`, `CREATE TABLE IF NOT EXISTS` + guarded `ALTER TABLE ... ADD COLUMN` + ownership backfill. **No migration runner script, no migration files directory**; migrations execute lazily on service construction. `[CONFIRMED]` |
| Test framework | Vitest 3.2.4, `vitest.config.ts` → `tests/**/*.test.ts`, node environment, 30 s timeout, alias `@`. 16 test files. `[CONFIRMED]` |
| Existing audit | `docs/GOVLENS_IMPLEMENTATION_AUDIT.md` (2026-09-23, code-verified, 131 tests green at that date). Read at the start of this audit per the engineering rules. `[CONFIRMED]` |

### A.3 Exact supported commands

| Purpose | Command | Result in this audit |
|---|---|---|
| Development server | `npm run dev` (or `npm run dev:lan` for `0.0.0.0`) | identified, **not run** `[CONFIRMED script, UNCERTAIN runtime]` |
| Lint | `npm run lint` (`next lint`) | **exit 0 — "No ESLint warnings or errors"** `[CONFIRMED]` |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **exit 0 — no errors** `[CONFIRMED]` |
| Unit/integration tests | `npm test` (`vitest run`) | **exit 0 — 16 files, 131/131 tests passed, 895 ms** `[CONFIRMED]` |
| Separate integration-test command | **none** — one Vitest suite covers unit + integration (`tests/backend.test.ts`, `tests/e2e-validation.test.ts`) | `[CONFIRMED]` |
| Production build | `npm run build` (`next build`) | **exit 0** — 10 static pages + 11 dynamic API routes emitted `[CONFIRMED]` |
| Production start | `npm run start` (or `start:lan`) | identified, not run |
| Manual E2E checklist | `tests/e2e-checklist.md` (browser-only paths: camera/OCR/voice) | `[CONFIRMED]` |

There is **no** `db:migrate`, `seed`, `format`, `coverage` or CI workflow script in `package.json`. `[CONFIRMED]`

### A.4 Deployment artefacts (read only)

`deploy/govlens.service` (systemd), `deploy/nginx-govlens.conf`, `deploy/env.production.example`, `DEPLOY.md`. Not modified. `[CONFIRMED]`

---

## B. FRONTEND TRACE

### B.1 Route inventory

Exactly **10 pages** exist under `app/` (verified by build output and file listing). There is **no** `middleware.ts`, and **no** route-level `loading.tsx` / `error.tsx` / `not-found.tsx` anywhere. `[CONFIRMED]`

| Route | File |
|---|---|
| `/` | `app/page.tsx` |
| `/scan` | `app/scan/page.tsx` |
| `/result` | `app/result/page.tsx` |
| `/schemes` | `app/schemes/page.tsx` |
| `/services` | `app/services/page.tsx` |
| `/documents` | `app/documents/page.tsx` |
| `/help` | `app/help/page.tsx` |
| `/about` | `app/about/page.tsx` |
| `/caseworker` | `app/caseworker/page.tsx` |
| `/caseworker/[id]` | `app/caseworker/[id]/page.tsx` |

All frontend network calls are funnelled through **one** client module: `app/services/api.ts` (fetches at lines 76, 99, 150, 167, 180, 189, 193, 198, 207, 219, 228, 233, 238). `[CONFIRMED]`

### B.2 Feature-by-feature trace (route → API → service → table → verdict)

| # | Feature | Route/component | API endpoint | Service function | DB table | Verdict |
|---|---|---|---|---|---|---|
| 1 | Home page | `app/page.tsx:6` | `GET /api/health` via `HealthNotice.tsx:11` | `apiHealth` (`app/services/api.ts:68`) | none | **WORKS END-TO-END** `[CONFIRMED]` |
| 2 | Document upload/scan | `app/scan/page.tsx:39` | `POST /api/analyze` (SSE) at `scan/page.tsx:201-207` | `validateFile`/`normalizeDocumentFile` (`app/lib/ingestion.ts`), `getOCRService()` (`app/lib/ocr-service.ts`) | `sessions`, `documents`, `document_extractions`, `analysis_*` | **WORKS END-TO-END** `[CONFIRMED]` |
| 3 | Analysis/result | `app/result/page.tsx:22` | `POST /api/translate`, `POST /api/ask`, `POST /api/cases` (`result/page.tsx:55,72,107`) | `getSession`/`updateSession` (`app/lib/session-store.ts:90,102`) | read = **sessionStorage**; writes `cases`, `case_sources`, `checklist_items`, `conversation_messages` | **WORKS END-TO-END** (client-session state only; no server reload — `/result` shows "No document analysed yet" after a fresh visit) `[CONFIRMED]` |
| 4 | Schemes page | `app/schemes/page.tsx:13` | **none** | static JSON imports of the 5 corpus docs (`schemes/page.tsx:4-11`) | none | **WORKS as a static page** — 5 hard-coded cards, no `/schemes/[id]` `[CONFIRMED]` |
| 5 | Services page | `app/services/page.tsx:5` | **none** | `POPULAR_SERVICES` (`app/lib/portal-data.ts:11-66`) | none | **INCOMPLETE / stub** — 6 hard-coded cards whose hrefs are only `/scan`, `/schemes`, `/documents` (`portal-data.ts:19,28,37,46,55,64`). **No `/services/[id]`, no service records, no search, no categories.** `[CONFIRMED]` |
| 6 | Document history | `app/documents/page.tsx:26` | `GET /api/cases` (`documents/page.tsx:32`) | `apiListCases` (`api.ts:188`) | `cases WHERE owner_id = ?` (`CaseService.ts:178`) | **INCOMPLETE** — list/filters/states work, but every row links to `/caseworker/{id}` (`documents/page.tsx:107`), which gates citizens out (`caseworker/[id]/page.tsx:25-40`). `GET /api/cases/:id` + `apiGetCase` (`api.ts:193`) **exist but are never called** → citizen case detail is dead. `[CONFIRMED]` |
| 7 | Chat/Q&A | inside `/result` only (`result/page.tsx:484-552`) | `POST /api/ask` (`result/page.tsx:72`) | `apiAsk` (`api.ts:146`) | `conversation_messages`, `sessions`, `document_claims`, `knowledge_chunks`, `government_sources` | **WORKS END-TO-END** (grounded badge + source list per answer at `result/page.tsx:545-546`). No standalone `/chat` route. `[CONFIRMED]` |
| 8 | Language selector | `GovHeader.tsx:49-64` → `PortalProvider.tsx:67-74` | none direct; drives `ask.language`, auto-TTS, `VoiceInput` | `usePortal()` (localStorage `govlens-lang`) | none | **WORKS for Q&A/voice/tabs; PARTIAL as localization** — page copy is English-only, and `/scan` hard-codes `language: "en"` (`scan/page.tsx:203`). `[CONFIRMED]` |
| 9 | Speech input/output | `VoiceInput.tsx:12`, `VoiceOutput.tsx:17` (used only in `/result`) | none (browser Web Speech API) | `getVoiceService()` (`app/lib/voice-service.ts`) → `lib/voice/VoiceService.ts` | none | **WORKS END-TO-END**, honest degradation when unsupported (`VoiceInput.tsx:43-49`, `VoiceOutput.tsx:44-47`) `[CONFIRMED]` |
| 10 | Caseworker login | `app/caseworker/page.tsx:14` | `POST/GET/DELETE /api/caseworker/login` (`page.tsx:22,39`) | `verifyCaseworkerCode`, `setCaseworkerCookie` (`lib/auth/identity.ts:53,71`) | none (cookie only) | **WORKS END-TO-END** (shared access-code gate, demo-grade) `[CONFIRMED]` |
| 11 | Caseworker queue | `app/caseworker/page.tsx` | `GET /api/caseworker/cases` (`page.tsx:26,41`) | `CaseService.listAll()` (`CaseService.ts:184-186`) | `cases` (all rows) | **WORKS END-TO-END** `[CONFIRMED]` |
| 12 | Caseworker details | `app/caseworker/[id]/page.tsx:12` | `GET /api/caseworker/cases/:id` (`page.tsx:17`) | `apiGetAnyCase` (`api.ts:237`) | `cases`, `case_sources`, `checklist_items` | **WORKS END-TO-END** `[CONFIRMED]` |
| 13 | Status updater | `app/components/CaseStatusUpdater.tsx:12` (mounted at `caseworker/[id]/page.tsx:71-75`) | `PATCH /api/cases/:id` (`CaseStatusUpdater.tsx:30`) | `CaseService.updateStatus` (`CaseService.ts:204-208`) | `cases` — plain `UPDATE ... SET status` | **WORKS END-TO-END**, but **overwrites with no history row** (see D.4) `[CONFIRMED]` |
| 14 | Header/nav/footer | `app/layout.tsx:24-28`, `GovHeader.tsx`, `GovFooter.tsx` | none | `usePortal()` | none | **WORKS** — nav = `Home / Services / Schemes / Documents / Help / About` (`GovHeader.tsx:7-14`), language group, accessibility A-/A/A+/contrast. **No Grievance/Complaint nav item.** `[CONFIRMED]` |
| 15 | Shared styles/tokens | `app/globals.css` (76 lines), `tailwind.config.ts` (51 lines) | none | `--gov-font-scale`, `.gov-contrast`, `.gov-card/.gov-btn*/.gov-input/.gov-table/.gov-badge` (`globals.css:27-76`), palette `gov.navy #123B63 … gov.red #B42318` (`tailwind.config.ts:8-23`) | none | **WORKS**, used pervasively. Note: Tailwind `content` scans only `./app/**` (`tailwind.config.ts:4`). `[CONFIRMED]` |
| 16 | Loading/empty/success/error states | inline in each page (`scan/page.tsx:250-276,320-324`; `result/page.tsx:116-147`; `documents/page.tsx:70-88`; `caseworker/page.tsx:54-71,139-148`; `HealthNotice.tsx:20-32`) | — | — | — | **WORKS component-level; route-level `loading/error/not-found` files are MISSING** `[CONFIRMED]` |

**Dead/unused frontend code confirmed by grep** `[CONFIRMED]`:
- `app/components/ActionChecklist.tsx` — never imported.
- `apiGetCase` (`app/services/api.ts:193`) and `apiSourceMetadata` (`api.ts:207`) — defined, never called (source metadata actually reaches the UI from the client-side `session.sources` instead; `app/result/page.tsx:153`).
- `aiLangFor` (`PortalProvider.tsx:100`) — never called.
- `app/services/persistence.ts` — 2-line stub whose comment references a **non-existent** file `app/lib/case-management.ts`.

---

## C. AI ARCHITECTURE AUDIT

### C.1 Provider abstraction — a provider interface already exists

- **`lib/ai/AIEngine.ts` is the contract** (`interface AIEngine`, `AIEngine.ts:87-99`) with 9 methods: `analyzeDocument`, `verifyGovernmentDocument`, `extractDocumentFields`, `explainDocument`, `answerQuestion`, `translate`, `generateActionPlan`, `cleanupOcrText`, `analyzeDeep`. Input/output types are declared at `AIEngine.ts:12-98`.
- **Exactly one implementation exists: `OllamaGemmaEngine`** (`lib/ai/OllamaGemmaEngine.ts`, 646 lines), singleton via `getAIEngine()`. There is no second implementation and no stub. `[CONFIRMED]`
- **Conclusion: no new provider interface needs to be invented** — adding a provider means implementing the existing `AIEngine` interface. `[CONFIRMED]`

### C.2 Ollama configuration and behaviour

| Aspect | Finding | Citation |
|---|---|---|
| Base URL | `process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"` | `OllamaGemmaEngine.ts:63` |
| Model | `process.env.OLLAMA_MODEL ?? "gemma3:4b"` | `OllamaGemmaEngine.ts:67` |
| Timeout | **single** `OLLAMA_TIMEOUT_MS` (default **180000 ms**) per request via one `AbortController` + `setTimeout`; explicitly "no other timeouts exist in the AI layer" | `OllamaGemmaEngine.ts:72-75`, `141-142` |
| Cancellation | `AbortController` aborts the fetch; no other cancellation path | `OllamaGemmaEngine.ts:141-142` |
| Retries | **max 1** retry with a stricter correction prompt, then controlled fallback (never fabricated data) | `OllamaGemmaEngine.ts:11`, `191-202`, `535-544` |
| Generation limits | `OLLAMA_NUM_PREDICT` default **512** (output cap only); per-stage override `OLLAMA_NUM_PREDICT_<STAGE>` | `OllamaGemmaEngine.ts:79-98` |
| Determinism | `temperature: 0`, Ollama JSON-schema `format` for structured stages | `OllamaGemmaEngine.ts:10`, `153` |
| Prompt construction | `GROUND_RULES` preamble at `OllamaGemmaEngine.ts:103` (not a government authority, does not authenticate documents); per-stage prompts (e.g. extraction rule at `:282`) | `[CONFIRMED]` |
| Validation | **Zod** validation of every model response (`validateExtractionJson`, `validateExplanationJson`, schemas in `lib/extraction/schemas.ts`, `lib/analysis/*-schemas.ts`) | `[CONFIRMED]` |
| Chat history | `QuestionInput.history` — recent turns passed to `answerQuestion`, still document-scoped (`AIEngine.ts:26`); persisted to `conversation_messages` by `app/api/ask/route.ts:123-124` and read back at `:47` | `[CONFIRMED]` |
| Knowledge retrieval | `KnowledgeEngine` interface (`lib/knowledge/KnowledgeEngine.ts`) + `LocalKnowledgeEngine` — **SQLite keyword retrieval** (`scoreText`/`tokenize` in `lib/knowledge/search.ts`), terminology alias expansion, aggregate-per-document best-chunk scoring, `limit` default 3 (`LocalKnowledgeEngine.ts:75-126`). No embeddings, no vector DB. | `[CONFIRMED]` |
| Health endpoint | `GET /api/health` (`app/api/health/route.ts:8-24`) → `{status, ollama, modelAvailable, model, ok, detail}` | `[CONFIRMED]` |
| Error handling | `AIEngineUnavailableError` / `AITimeoutError` (`AIEngine.ts:101-114`); `/api/ask` maps unavailable → **503 `AI_UNAVAILABLE`**, everything else → 500 with message (`ask/route.ts:135-143`) | `[CONFIRMED]` |
| Chunking | `lib/ai/chunking.ts` — ≤4 chunks with per-stage budgets (per prior audit) | `[CONFIRMED]` |

### C.3 Is Ollama started automatically? (required distinction)

**No. Ollama is never started by the application.** `[CONFIRMED]`

- Repo-wide search for `child_process`, `spawn(`, `exec(`, `execSync`, `ollama serve` under `app/` and `lib/` returned **only human-readable strings**:
  - `lib/ai/OllamaGemmaEngine.ts:169` — error message: *"Start it with `ollama serve`..."*
  - `app/api/health/route.ts:11` — status `detail` string.
  - `app/components/HealthNotice.tsx:27` — rendered help text.
  - `lib/db/database.ts:26` — `exec(sql)` is the SQLite wrapper's own method, unrelated to shells.
- No `child_process` import, no shell command, no hidden server-startup logic exists anywhere.
- **References to Ollama ≠ starting Ollama.** The app only makes HTTP `fetch` calls to an already-running Ollama daemon.

### C.4 Is Ollama exposed to public users?

**No — Ollama itself is server-side only.** `[CONFIRMED]`
- `.env.example:3` explicitly states `OLLAMA_*` must never gain a `NEXT_PUBLIC_` prefix.
- No client code calls `localhost:11434`; the only client entry points are the Next.js API routes (`app/services/api.ts`).
- **Public users do reach Ollama indirectly** through three anonymous endpoints: `POST /api/analyze`, `POST /api/ask`, `POST /api/translate` — all of which forward prompts to the local model. `GET /api/health` anonymously discloses Ollama reachability and the configured model name (minor info disclosure; the `detail` string hardcodes `localhost:11434` and does not reflect a custom `OLLAMA_BASE_URL`). `[CONFIRMED]`

---

## D. DATABASE & AUTHORIZATION AUDIT

### D.1 Actual schema (from `lib/db/migrations.ts`, all idempotent)

**Core:** `sessions`, `documents`, `document_extractions`, `conversation_messages`, `government_sources`, `knowledge_chunks`, `cases`, `case_sources`, `checklist_items` (`migrations.ts:21-124`).
**Analysis:** `analysis_documents`, `document_pages`, `document_entities`, `document_claims`, `document_evidence` (`:126-196`).
**Deep:** `analysis_questions`, `analysis_answers`, `timelines`, `contradictions`, `analysis_reports`, `analysis_findings` (`:198-277`).
**Legal:** `legal_headers`, `parties`, `legal_provisions`, `doc_relationships`, `case_bundles`, `case_bundle_items` (`:279-339`).
**Scheme:** `scheme_reports`, `eligibility_requirements`, `scheme_documents` (`:341-386`).
**Verification:** `verification_sources`, `verification_results` (`:388-421`).
**Additive columns:** `sessions.owner_id`, `documents.owner_id`, `document_extractions.owner_id`, `conversation_messages.owner_id`, `cases.{owner_id, verification_json, explanation_json, qa_json, file_name, file_type}`, `checklist_items.owner_id` (`:422-445`); backfill to `owner_id='prototype-admin'` (`:450-463`); indexes `idx_cases_owner`, `idx_sessions_owner` (`:464-469`).

**Indexes:** session/status/owner/document/report indexes at `:117-123`, `:185-195`, `:270-277`, `:330-339`, `:382-386`, `:416-421`.

### D.2 Identity model — the required inventory

| Concept | Exists? | Where | Notes |
|---|---|---|---|
| Citizen/user identity | **YES** | anonymous UUID cookie `govlens_user_id` via `getOrCreateUserId()` (`lib/auth/identity.ts:28-35`) | HttpOnly, SameSite=Lax, `Secure` when `NODE_ENV=production`, 1-year maxAge, UUID-validated. No login/registration for citizens. |
| Owner identity | **YES** | `owner_id` columns (D.1) + `PROTOTYPE_OWNER = "prototype-admin"` (`identity.ts:8`) | Not a valid UUID ⇒ cannot be produced by `getOrCreateUserId()`, so it cannot be impersonated. |
| Caseworker/admin identity | **YES, demo-grade** | cookie `govlens_caseworker` = `sha256("govlens-cw:" + code)` hex (`identity.ts:48-73`), verified by `isCaseworker()` (`:59-69`) with `timingSafeEqual` | Shared code, **not** a random session token — see S-2. |
| Sessions/cookies | **YES** | `lib/auth/identity.ts` (cookies), DB `sessions` table (analysis session, not auth session) | Two different meanings of "session" — cookie session vs. analysis `session_id`. |
| Documents & uploaded files | **partial** | DB rows `documents`, `analysis_documents`; **no file storage at all** | Uploads are normalized **client-side** (`app/lib/ingestion.ts`); server receives text. Only disk write in the system is the SQLite file (`lib/db/database.ts:40`). |
| Extracted document data | **YES** | `document_extractions`, `document_entities`, `document_pages`, `document_claims` | |
| Analysis reports | **YES** | `analysis_reports`, `analysis_findings`, `scheme_reports`, `legal_headers`, `verification_results` | |
| Citizen cases | **YES** | `cases` (+ `case_sources`, `checklist_items`) | These are *document-assistance* cases, **not** grievances. |
| Grievance-like records | **NO** | — | No table, column, type, route or page contains grievance/complaint/redressal (only prose in `app/data/documents/telangana/dharani-land-passbook.json:12`). |
| Status history | **NO** | — | `CaseService.updateStatus` overwrites `status` and `updated_at` (`CaseService.ts:208`); previous value is discarded. No `status_history` table. |
| Attachment metadata | **NO** | — | No `attachments` table; no `formData`/`writeFile`/multipart handling anywhere in `app/` or `lib/`. |
| Official-source records | **YES** | `government_sources` + `knowledge_chunks`, seeded from 5 JSON corpus docs (`LocalKnowledgeEngine.ts:24-30`) | Fields include `source_url`, `published_date`, `effective_date`, `last_verified`. |
| Audit logs | **NO** | — | No audit table, endpoint or request logging. |

### D.3 Endpoint-by-endpoint authorization behavior

No `middleware.ts` exists; all authorization lives inside route handlers. `[CONFIRMED]`

| Endpoint | Identity source | Owner scoping | Staff gate | Verdict |
|---|---|---|---|---|
| `POST /api/analyze` | `getOrCreateUserId()` — `analyze/route.ts:63` | writes `owner_id` on sessions/documents/analysis (`:64-71,83,156`); reusing a foreign `sessionId` throws (`SessionService.ts:45-47`) | no | **SECURE** |
| `POST /api/ask` | `getOrCreateUserId()` — `ask/route.ts:29` | `sessions.get(sessionId, ownerId)` → 404 (`:37`); claims query `AND owner_id = ?` (`:53,57`) | no | **SECURE** |
| `GET /api/analysis/report` | `getOrCreateUserId()` — `analysis/report/route.ts:21` | `getSession(sessionId, ownerId)` (`:22`); `analysis_documents ... AND owner_id = ?` (`:28`); every sub-query in `lib/analysis/store.ts:236-263` has `AND owner_id = ?` | no | **SECURE** |
| `POST /api/cases` | `getOrCreateUserId()` — `cases/route.ts:43` | verifies `sessionId` ownership (`:48`); INSERT carries `owner_id` (`CaseService.ts:120,148`) | no | **SECURE** |
| `GET /api/cases` | `getOrCreateUserId()` — `cases/route.ts:19` | `SELECT * FROM cases WHERE owner_id = ?` (`CaseService.ts:178`) | no | **SECURE** |
| `GET /api/cases/[id]` | `getOrCreateUserId()` — `cases/[id]/route.ts:13` | `WHERE id = ? AND owner_id = ?` (`CaseService.ts:200`); foreign id → 404 without revealing existence | no | **SECURE** |
| `PATCH /api/cases/[id]` | `isCaseworker() ? undefined : getOrCreateUserId()` — `cases/[id]/route.ts:38` | citizen path owner-checked first (`CaseService.ts:205`), then `UPDATE ... WHERE id = ?` (`:208`) | **yes — bypasses owner filter for staff** | **SECURE for citizens / staff-gated** (depends on gate strength, S-2) |
| `GET /api/caseworker/cases` | `if (!isCaseworker()) 401` — `caseworker/cases/route.ts:7` | intentionally none: `listAll()` (`CaseService.ts:186`) | **yes** | **GATED** |
| `GET /api/caseworker/cases/[id]` | `if (!isCaseworker()) 401` — `caseworker/cases/[id]/route.ts:7` | `get(id, undefined, true)` → `allowAny` → `WHERE id = ?` only (`CaseService.ts:199`) | **yes** | **GATED** |
| `POST/GET/DELETE /api/caseworker/login` | shared code vs `CASEWORKER_ACCESS_CODE`, timing-safe (`login/route.ts:21`, `identity.ts:53-57`) | n/a | this *is* the gate | **SECURE (demo-grade)** |
| `POST /api/verification/evidence` | `getOrCreateUserId()` — `verification/evidence/route.ts:34` | document + claims both `AND owner_id = ?` (`:38-45`), else 404 | no | **SECURE** |
| `POST /api/sources` | **none** (`sources/route.ts:5-19`) | n/a — reads only the public static corpus by id | no | **SECURE (public data by design)**; accepts only corpus source ids, never user ids |
| `POST /api/translate` | none (`translate/route.ts:10`) | n/a — stateless | no | **SECURE** |
| `GET /api/health` | none (`health/route.ts:8`) | n/a | no | **SECURE-ish** — discloses Ollama reachability + model name |

### D.4 Cross-user access tests (code review, as required)

| Attack | Possible? | Evidence |
|---|---|---|
| Citizen A reads citizen B's **cases** | **NO confirmed path** | `WHERE id = ? AND owner_id = ?` on every citizen read (`CaseService.ts:178,200`); list endpoint owner-scoped (`cases/route.ts:19`). Staff-only endpoints are behind `isCaseworker()`. |
| Citizen A reads citizen B's **documents** | **NO** | No document-download endpoint exists; document text is only reachable through owner-scoped `sessions.get(id, ownerId)` (`ask/route.ts:37`, `analysis/report/route.ts:22`). |
| Citizen A reads citizen B's **analyses** | **NO** | All analysis tables read via `AnalysisStore.readBundle(documentId, ownerId)` with `AND owner_id = ?` in every sub-query (`store.ts:236-263`). |
| Citizen A reads B's **attachments** | **N/A** | Attachments do not exist (D.2). No file routes ⇒ no IDOR surface on files. |
| Citizen A reads **staff-only notes** | **N/A** | Staff notes do not exist. `userNote` in `createCaseRequestSchema` (`apiSchemas.ts:37`) is **dead** — never read by `app/api/cases/route.ts`, never persisted. |
| Staff status write | possible **by design** | `PATCH /api/cases/[id]` allows `isCaseworker()` to write any case (`cases/[id]/route.ts:38`) — intended. |

**Nuances (fragility, not current leaks)** `[CONFIRMED]`:
1. `SessionService.saveAnalysis()`/`saveDocument()` run `UPDATE sessions ... WHERE id = ?` **without** an owner filter (`SessionService.ts:99,128`); safety relies on `sessions.create()` throwing for foreign sessions (`:45-47`). Safe today, fragile if refactored.
2. `CaseService.updateStatus`'s `UPDATE` has no owner filter (`CaseService.ts:208`); safety relies on the preceding ownership check at `:205`.
3. Client-suppliable `sessionId` in `analyzeRequestSchema` (`apiSchemas.ts:11`) is a mild **existence oracle**: a foreign existing sessionId returns 500 vs 200 for an unknown one — no data leaks, but a 404 would be cleaner.

---

## E. PUBLIC GRIEVANCE REQUIREMENT MATRIX (23 items)

**Method:** every item was searched for repo-wide (case-insensitive `grievance|complaint|ticket|redressal|feedback|status history|staff note|attachment|service directory`) and then traced in code. `[CONFIRMED]` unless noted.

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | **Service directory** | **MISSING (PARTIAL skeleton)** | `/services` exists but renders 6 hard-coded `POPULAR_SERVICES` cards (`app/services/page.tsx:5-32`, `portal-data.ts:11-66`). No records, no API, no DB. |
| 2 | **Categories and search** | **MISSING** | No category model, no search input, no filter on `/services`. (`/documents` has client-side filters only — a different feature.) |
| 3 | **Individual service details** | **MISSING** | No `/services/[id]` route (build output lists only `/services`). Card hrefs point to `/scan`, `/schemes`, `/documents`. |
| 4 | **≥15 meaningful service records** | **MISSING** | 6 static cards + 5 knowledge documents (`app/data/documents/**`). Neither is a service record. |
| 5 | **Curated official/sample knowledge base** | **IMPLEMENTED (small)** | 5 seeded sources → `government_sources` + `knowledge_chunks` (`LocalKnowledgeEngine.ts:24-73`), with `source_url`, `published_date`, `effective_date`, `last_verified` columns (`migrations.ts:59-78`). |
| 6 | **Q&A grounded in retrieved records** | **PARTIAL** | Grounded RAG works — `kb.search(...)` (`ask/route.ts:109-110`) → `engine.answerQuestion` → `grounded` flag (`:113-134`). **But Q&A is document-scoped**: without a `sessionId` or `documentText` it returns 422 (`ask/route.ts:84-89`). There is no standalone "ask the knowledge base" public mode. |
| 7 | **Source links displayed with answers** | **IMPLEMENTED (two paths)** | Per-answer source ids + grounded badge (`result/page.tsx:545-546`) and the "🏛 Official Information" table with a **Link** and **Last Verified** column (`result/page.tsx:554-575`) from `session.sources`. Endpoint `POST /api/sources` returns provenance, never fabricates (`sources/route.ts:5-19`, `SourceService.ts:26-36`). *Note: client wrapper `apiSourceMetadata` is unused.* |
| 8 | **Honest last-reviewed dates** | **IMPLEMENTED** | `government_sources.last_verified` is a required column (`migrations.ts:69`) populated per source (e.g. `app/data/documents/government-of-india/pmkisan.json:11` → `"lastVerified": "2026-09-01"`) and rendered. Values are **static seed dates**, not dynamically verified. |
| 9 | **Unsupported-question handling** | **PARTIAL** | Controlled unverified fallback sentence, Zod retry then exact "could not verify" text (`OllamaGemmaEngine.ts:191-202,535-544`); grounding rules forbid invention (`:103`). Missing: explicit "this question is outside the knowledge base" routing for non-document questions (422 instead, `ask/route.ts:84-89`). |
| 10 | **Language selection** | **PARTIAL** | EN/TE/HI selector in `GovHeader.tsx:49-64`, persisted (`PortalProvider.tsx:67-74`), drives Q&A/TTS/voice; script + romanized-Telugu detection (`ask/route.ts:95-107`); `POST /api/translate` for EN⇄TE. Page copy is English-only and `/scan` hard-codes `"en"` (`scan/page.tsx:203`). |
| 11 | **Grievance form (subject, description, category, location/area, optional attachment)** | **MISSING** | No form, no route, no schema field for any of these. Closest analogue is "Create Case" (`result/page.tsx:616-628`) which has none of subject/category/location/attachment semantics. |
| 12 | **Unique grievance reference number** | **MISSING** | The only `reference_number` is the *scanned document's* reference extracted from the uploaded file (`migrations.ts:92`; `result/page.tsx:190`). No generated complaint reference. |
| 13 | **Submission confirmation** | **MISSING** | No grievance submission ⇒ no confirmation. (Case-created confirmation exists at `result/page.tsx:621-628` — a different flow.) |
| 14 | **Citizen dashboard** | **PARTIAL (wrong domain)** | `/documents` is an owner-scoped citizen dashboard for **cases** (`documents/page.tsx:32`, `CaseService.ts:178`) with loading/empty/error states. No grievance dashboard. |
| 15 | **Grievance status page** | **MISSING** | Status is shown only inside the caseworker case detail (`caseworker/[id]/page.tsx`) and `StatusBadge`. No citizen-facing complaint status page. |
| 16 | **Status history** | **MISSING** | No `status_history` table and no transition endpoint; `updateStatus` overwrites (`CaseService.ts:208`). |
| 17 | **Protected staff/admin queue** | **PARTIAL (exists for cases, not grievances)** | `GET /api/caseworker/cases` + login gate (`caseworker/cases/route.ts:7`) is a working, protected staff queue — but it queues document-assistance cases only. Strength caveat S-2. |
| 18 | **Staff status updates** | **IMPLEMENTED (for cases)** | `PATCH /api/cases/:id` behind `isCaseworker()` (`cases/[id]/route.ts:38`), UI `CaseStatusUpdater.tsx` (statuses `open|needs_review|completed`). No grievance statuses. |
| 19 | **Public vs private staff notes** | **MISSING** | No notes concept at all (D.2). `userNote` schema field exists but is dead (`apiSchemas.ts:37`). |
| 20 | **Secure attachment handling** | **MISSING** | No attachment upload/download/storage anywhere; no `formData`/`writeFile`/multipart in `app/` or `lib/`. |
| 21 | **User isolation** | **IMPLEMENTED** | Cookie-derived `owner_id` on every citizen endpoint (D.3/D.4); no confirmed cross-user read path. |
| 22 | **Duplicate complaint warnings** | **MISSING** | No duplicate detection anywhere (no complaint records to compare). |
| 23 | **Category/status analytics** | **MISSING** | No analytics endpoint or dashboard. Caseworker register shows raw counts only (`caseworker/page.tsx`). |

**Totals: IMPLEMENTED 4 · PARTIAL 6 · MISSING 13 · BROKEN 0.**

---

## F. FILE-BY-FILE GAP REPORT

### F.1 Current architecture

Next.js 14.2.5 App Router monolith — React 18 + TypeScript (strict) + Tailwind `gov-*` design tokens; SQLite via Node built-in `node:sqlite` (`lib/db/database.ts`); single local AI provider (`OllamaGemmaEngine` → Ollama `gemma3:4b`, server-side only); browser-side OCR (Tesseract.js), PDF/DOCX normalization in `app/lib/ingestion.ts`; identity = anonymous HttpOnly UUID cookie + shared caseworker code (`lib/auth/identity.ts`). No ORM, no auth framework, no background jobs, no file storage. End-to-end flow is documented in `docs/CURRENT_ARCHITECTURE.md` (read, not modified).

### F.2 Existing frontend routes/components
Listed in B.1/B.2 — 10 pages, 14 components under `app/components/`, 1 API client (`app/services/api.ts`), shared tokens in `app/globals.css` + `tailwind.config.ts`.

### F.3 Existing AI provider architecture
`lib/ai/AIEngine.ts` (interface) → `lib/ai/OllamaGemmaEngine.ts` (sole impl) + `lib/ai/chunking.ts`; schemas in `lib/extraction/schemas.ts`, `lib/analysis/*-schemas.ts`, `lib/verification/schemas.ts`; retrieval in `lib/knowledge/*`. **A provider interface already exists — do not create another.** No `child_process`, no auto-start of Ollama.

### F.4 Existing database schema
Full table/index/column inventory in D.1. Additive-migration pattern is established and must be followed (`CREATE TABLE IF NOT EXISTS` + guarded `ALTER TABLE` + `try/catch`), see `lib/db/migrations.ts:422-469`.

### F.5 Existing APIs and their authorization behavior
Full table in D.3; cross-user analysis in D.4. Rule to preserve: **identity only from `cookies()`, never from body/query/params.**

### F.6 Existing working features to preserve (do not redesign/replace)

1. `/scan` → `POST /api/analyze` SSE pipeline with verification gate (`scan/page.tsx`, `api/analyze/route.ts`).
2. `/result` analysis view + grounded Q&A + Official Information table (`result/page.tsx`).
3. `/documents` owner-scoped register and `/caseworker` staff register + `CaseStatusUpdater`.
4. `POST /api/ask` grounded Q&A with `grounded` flag, history persistence, EN/TE/HI detection.
5. `LocalKnowledgeEngine` seeding + `SourceService` provenance (never fabricates sources).
6. Cookie identity (`lib/auth/identity.ts`) and `isCaseworker()` gate.
7. `AIEngine` interface + `OllamaGemmaEngine` (timeouts, 1 retry, Zod, per-stage budgets).
8. Design system: `gov-*` tokens, `GovHeader`/`GovFooter`/`Breadcrumb`, accessibility controls, `VoiceInput`/`VoiceOutput`.
9. Idempotent additive migrations and the 131-test Vitest suite.

### F.7 Features needing extension (exist partially — extend, don't rebuild)

| Feature | Extension needed | Anchor files |
|---|---|---|
| Services page | Turn 6 static cards into a real directory: records, categories, search, detail route | `app/services/page.tsx`, `app/lib/portal-data.ts`, `app/components/GovHeader.tsx` |
| Knowledge base | Grow beyond 5 corpus docs toward ≥15 meaningful records with `last_verified` | `app/data/documents/**`, `lib/knowledge/LocalKnowledgeEngine.ts`, `lib/sources/SourceService.ts` |
| Q&A | Add a non-document-scoped, KB-grounded question path + honest unsupported-question response | `app/api/ask/route.ts`, `lib/ai/OllamaGemmaEngine.ts` |
| Language selection | Apply `lang` to scan + UI copy (currently hard-coded `"en"`) | `app/scan/page.tsx:203`, page components |
| Caseworker queue | Reuse gate + register pattern for a grievances queue | `app/caseworker/page.tsx`, `lib/auth/identity.ts`, `lib/cases/CaseService.ts` |
| Status updates | Reuse `PATCH` pattern but add an **append-only history table** (new, additive) | `lib/cases/CaseService.ts`, `app/components/CaseStatusUpdater.tsx` |
| Citizen dashboard | Reuse `/documents` layout for a grievance view; wire the dead `apiGetCase` | `app/documents/page.tsx`, `app/services/api.ts:193` |
| Isolation | Apply the same `owner_id` scoping recipe to every new grievance table/endpoint | `lib/auth/identity.ts`, `lib/db/migrations.ts` |

### F.8 Features that are genuinely MISSING (require new code)

1. Grievance/complaint domain: form, submission, unique reference number, confirmation.
2. Grievance tables: complaints, status history, attachments, staff notes (public/private), audit log.
3. Citizen grievance dashboard + status page (with history).
4. Staff grievance queue + status transitions + public/private notes.
5. Service directory data model (≥15 records), categories, search, `/services/[id]`.
6. Duplicate-complaint warning and category/status analytics.
7. Attachment upload/download (secure, owner-scoped, staff-gated).
8. Route-level `loading.tsx` / `error.tsx` / `not-found.tsx` (nice-to-have).

**There is zero pre-existing grievance code** — repo-wide search matched only prose inside `app/data/documents/telangana/dharani-land-passbook.json:12`. This means no duplicate implementation risk, but also no reusable grievance service/table.

### F.9 Bugs or security concerns

| ID | Severity | Issue | Evidence |
|---|---|---|---|
| **S-1** | **High (config-dependent)** | Caseworker cookie is a **deterministic hash of a shared code** (`sha256("govlens-cw:"+code)`), so anyone who knows the code can mint the cookie client-side; and if `CASEWORKER_ACCESS_CODE` is unset the code falls back to the **public default `"govlens-demo"`** with only a console warning. The three gated endpoints then expose *all* citizens' cases (`listAll`, `allowAny`) plus cross-owner status writes. | `identity.ts:40-44,71-73`; `caseworker/cases/route.ts:7`; `cases/[id]/route.ts:38` |
| **S-2** | Medium | `Secure` cookie flag follows `NODE_ENV`, so plain-HTTP LAN-IP access would not persist identity (localhost + HTTPS unaffected). | `identity.ts:14` |
| **S-3** | Medium | Status updates are non-audited **overwrites** — no history, no audit log. | `CaseService.ts:204-211` |
| **S-4** | Low | `/api/health` anonymously discloses Ollama reachability + model name. | `health/route.ts:15-23` |
| **S-5** | Low | Client-suppliable `sessionId` is an existence oracle (500 "belongs to a different user" vs 200); returns no data. | `apiSchemas.ts:11`, `SessionService.ts:45-47` |
| **S-6** | Low | Document text enters prompts by design; grounding + JSON-only + Zod mitigate instruction injection, but `GROUND_RULES` has **no explicit "ignore instructions embedded in the document" clause** (already listed as fix #1 in the previous audit). | `OllamaGemmaEngine.ts:103,77` |
| **B-1** | Bug | `/documents` rows link to `/caseworker/{id}`, which citizens cannot open → citizen case detail unreachable, although `GET /api/cases/:id` + `apiGetCase` exist unused. | `documents/page.tsx:107`, `caseworker/[id]/page.tsx:25-40`, `api.ts:193` |
| **B-2** | Bug (cosmetic) | `OCRViewer` is always passed `ocr={null}` ⇒ its confidence/empty branches are dead. | `scan/page.tsx:312`, `OCRViewer.tsx:54-65` |
| **B-3** | Bug (stale doc) | `app/services/persistence.ts` references non-existent `app/lib/case-management.ts`. | `persistence.ts:1` |
| **B-4** | Gap | Session `evidence` is hard-coded `[]` on commit; no server reload of a case into `/result`. | `scan/page.tsx:161`, `result/page.tsx:124-147` |
| **B-5** | Gap | Dead code: `ActionChecklist.tsx`, `apiSourceMetadata`, `aiLangFor`, `userNote` schema field. | see B.2 |

**No critical cross-user leak was found.** `[CONFIRMED by code review]`

### F.10 Recommended implementation order (future phases — **none of this was implemented**)

1. **Service directory + knowledge corpus**: additive `services` (and category) records seeded to ≥15, `/services/[id]`, categories + search — extending `app/services/page.tsx` and the existing `government_sources` pattern.
2. **Public KB Q&A**: a document-independent, retrieval-grounded question path with source links, `last_verified` dates and explicit unsupported-question responses (extend `POST /api/ask`, reuse `LocalKnowledgeEngine` + `SourceService`).
3. **Grievance schema (additive migration only)**: `grievances` (unique reference number, subject, description, category, location/area, `owner_id`), `grievance_status_history`, `grievance_attachments`, `grievance_notes` (public/private flag), following `lib/db/migrations.ts` conventions.
4. **Citizen submission flow**: grievance form (reuse `gov-form`/`gov-card` tokens), confirmation with reference number, citizen dashboard + status page with history — all scoped by `getOrCreateUserId()`.
5. **Staff queue**: reuse the `isCaseworker()` gate + register pattern; status transitions writing history rows; public vs private notes; analytics counts.
6. **Attachments** (if required): owner-scoped storage and download with staff authorization; never expose files publicly.
7. **Security hardening (before any shared deployment)**: address S-1 (randomize caseworker session token / require the env var), S-2, S-6.

**Architectural blockers to report (per rule 12):** none blocking. The two constraints that shape future work are (a) `AIEngine` already exists as the provider contract, and (b) there is **no file-storage or note/history primitive** — attachments, status history and staff notes must all be built additively rather than reused.

### F.11 Exact source files likely to require changes (future phases)

| Area | Files |
|---|---|
| Migration (additive) | `lib/db/migrations.ts` |
| Grievance service | new `lib/grievances/*` (mirroring `lib/cases/CaseService.ts`) |
| New API routes | new files under `app/api/grievances/**`, `app/api/caseworker/grievances/**` (following existing route patterns) |
| Validation | `lib/validation/apiSchemas.ts` |
| Auth (reuse as-is; harden S-1) | `lib/auth/identity.ts` |
| Service directory UI | `app/services/page.tsx`, new `app/services/[id]/page.tsx`, `app/lib/portal-data.ts` |
| Grievance UI | new `app/grievance/**` pages; `app/components/GovHeader.tsx` (nav), `app/components/GovFooter.tsx` |
| Citizen dashboard | `app/documents/page.tsx` or new dashboard page; `app/services/api.ts` (new client wrappers) |
| Staff queue | `app/caseworker/page.tsx`, `app/caseworker/[id]/page.tsx`, `app/components/CaseStatusUpdater.tsx`, `lib/cases/CaseService.ts` |
| KB/Q&A | `app/api/ask/route.ts`, `lib/knowledge/LocalKnowledgeEngine.ts`, `lib/sources/SourceService.ts`, `app/data/documents/**` |
| Language | `app/scan/page.tsx`, `app/components/PortalProvider.tsx` |
| Tests | `tests/*.test.ts` (mirror `tests/backend.test.ts`, `tests/knowledge.test.ts`) |

**Files that must NOT be redesigned:** `app/result/page.tsx`, `app/scan/page.tsx`, `app/page.tsx`, `app/globals.css`, `tailwind.config.ts`, `lib/ai/*` (except additive).

### F.12 Commands available for validation

```bash
npm run dev        # development server  (not run in this audit)
npm run lint       # ESLint              → exit 0 [CONFIRMED]
npm run typecheck  # tsc --noEmit        → exit 0 [CONFIRMED]
npm test           # vitest run          → 131/131 passed [CONFIRMED]
npm run build      # next build          → exit 0, 10 pages + 11 API routes [CONFIRMED]
npm run start      # production server   (not run)
```
Plus manual browser checklist: `tests/e2e-checklist.md`.

---

## CONCISE AUDIT SUMMARY

**Baseline is green.** Branch `main`, working tree clean, last commit `e99d0bd`. `lint`, `typecheck`, `test` (131/131 across 16 files) and `build` (10 pages + 11 API routes) all exit 0. Migrations are idempotent and additive; no secrets or user data are committed (`.govlens-data/` and `.env*` are git-ignored).

**What genuinely works and must be preserved:** the `/scan → /result` document pipeline with SSE progress and a verification gate; grounded document Q&A with source links, `grounded` flags and honest unverified fallbacks; a keyword-retrieved, seeded official knowledge base (`government_sources` + `knowledge_chunks`) with `last_verified` provenance; owner-scoped citizen APIs; an `isCaseworker()`-gated staff register with working status updates; EN/TE/HI language and speech input/output; and the `gov-*` design system.

**Authorization:** identity comes only from HttpOnly cookies — `getOrCreateUserId()` for citizens, `isCaseworker()` for staff — and every citizen endpoint filters by `owner_id`. **No confirmed cross-user read/write path was found** for cases, documents, analyses, attachments or staff notes. The material risk is the *strength* of the caseworker gate: a deterministic hash of a shared code with a public `"govlens-demo"` fallback guarding endpoints that intentionally bypass owner scoping (S-1).

**Grievance readiness:** of the 23 public-grievance requirements — **4 IMPLEMENTED, 6 PARTIAL, 13 MISSING, 0 BROKEN**. The knowledge base, grounded Q&A, source links, language selection, user isolation and the staff-gate/status-update *patterns* are reusable; the grievance domain itself (form, reference number, dashboard, status page, history, staff queue, notes, attachments, service directory records, categories/search, analytics, duplicate detection) does not exist anywhere in the codebase. There is no Ollama auto-start and no `child_process` usage anywhere.

**Nothing was implemented in this phase.** No application source file (`app/**`, `lib/**`, `tests/**`, config, styles, schema) was modified, no package installed, no migration executed against app data, no Git command beyond `status` / `log` / `diff` / `ls-files`.

### Current Git status (at end of audit)

```
On branch main
Your branch is up to date with 'origin/main'.

Modified:   tsconfig.tsbuildinfo        (incidental — see note)
Untracked:  docs/GOVLENS_PUBLIC_GRIEVANCE_GAP_ANALYSIS.md   (this report)

nothing else to commit
```

**Note on `tsconfig.tsbuildinfo`:** the working tree was **clean at audit start** (verified by `git status` before any command ran). The tracked file `tsconfig.tsbuildinfo` was rewritten as a side effect of running the project's own documented validation command `npm run typecheck` (`tsc --noEmit` with `incremental: true` in `tsconfig.json`). It is a machine-generated TypeScript compile cache (single-line JSON), **not application code** — no source, test, config or data file changed (`git diff --stat` shows `1 file changed, 1 insertion(+), 1 deletion(-)`). No user work was overwritten. To restore it byte-for-byte to `HEAD` run `git checkout -- tsconfig.tsbuildinfo`; this was **not** run automatically, since the audit performed no working-tree-modifying Git operation.
