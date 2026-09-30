# GovLens Implementation Audit (code-verified, no changes made)

Audit date: 2026-09-23. Method: full-repo grep + file reads + live tests.
Every claim below cites the exact file/function. Nothing was modified.

## A. IMPLEMENTED (exists, wired, live-tested)

| Area | Evidence |
|---|---|
| Ingestion (PDF/DOCX/JPG/JPEG/PNG/text) | `app/lib/ingestion.ts` (`validateFile`, `normalizeDocumentFile`); pdf.js text-layer + page-render→OCR; mammoth DOCX; camera path untouched |
| NormalizedDocument | `lib/documents/normalized.ts` (`buildNormalizedDocument`); pages/blocks/provenance; binaries never reach Gemma |
| Classification (23 cats + conf + numbers/dates/authority) | `lib/analysis/foundation.ts` (`classifyDocument`); authenticity disclaimer baked into schema |
| Entities (DATE/MONEY/SURVEY/PHONE/REF/…) | same file (`extractEntities`), page+span+confidence |
| Claims (status starts `extracted`) | `extractClaims`; never treated as facts |
| Evidence (doc passages + official hits) | `buildEvidence`; `SourceService` provenance; no fabrication |
| Deep analysis (all 25 dimensions incl. HOW_* meta) | `lib/analysis/deep.ts` + `deep-schemas.ts`; graph ≤60, timeline, contradictions; one structured `analyzeDeep` Gemma pass |
| Legal (header/parties/provisions/matrix/relationships/bundles/cross-doc) | `lib/analysis/legal{,-schemas,-store}.ts`; roles only from explicit role language |
| Scheme (matrix/checklist/questions, UNKNOWN never → NOT_SATISFIED) | `lib/analysis/scheme{,-schemas}.ts` |
| Verification (adapters, 9 statuses, compare, traceability) | `lib/verification/{adapters,authorities,pipeline,store}.ts`; `POST /api/verification/evidence` |
| Report assembler (18 sections) | `lib/analysis/{assembler,report-schemas}.ts`; `GET /api/analysis/report` |
| Isolation (owner cookies, scoped queries, caseworker code gate) | `lib/auth/identity.ts`; 52 auth call sites; all citizen routes scoped |
| AI (staged calls, chunking ≤4, Zod, 1 retry, 180s single timeout, per-stage budgets) | `lib/ai/OllamaGemmaEngine.ts:75,142`; `lib/ai/chunking.ts` |

## B. PARTIALLY IMPLEMENTED

- **Claim status promotion**: statuses beyond `extracted` exist in schema but nothing promotes them (no corroboration writer yet).
- **Eligibility `SATISFIED`**: engine only emits UNKNOWN-family (correct conservative default); user-evidence submission path not built.
- **Cross-document bundles**: tables + `attachToSessionBundle` + `crossDocumentAnalysis` work, but no UI/API lists bundle contents.
- **9W+H answers**: only material/critical questions answered (cap 12); informational ones stay unanswered by design.
- **Scheme/legal UI**: backend computes; only summary counts/badges surfaced in existing UI sections.

## C. PLACEHOLDER (honest, declared — not fake)

- **Bhu Bharati / Registration / eCourts adapters**: capability declarations + official URLs + user-assisted lookup instructions are REAL; **automated portal queries do not exist** (no official machine API confirmed; no scraping/CAPTCHA bypass by design). `automated: false` is hardcoded.
- Fallback objects (unverified extraction, uncertain verification, timeout-degraded explanation) are controlled and labeled, containing no invented facts.
- No TODO/FIXME, no mock/fake/dummy, no simulated external results anywhere in `app/`/`lib/`.

## D. BROKEN

**Nothing broken found.** 131/131 tests, tsc/lint/build clean, live pipeline verified (gov → verified, receipt → not_government gate, isolation holds).

## E. SECURITY ISSUES

- None critical. Verified: owner scoping on every citizen route (the one `allowAny` call sits behind `isCaseworker()` 401-gate); cookies HttpOnly/SameSite=Lax/Secure-in-prod, server-derived only; filenames sanitized; no user files in `public/` (only manifest + pdf worker); no file writes except SQLite mkdir; no secrets in repo.
- **Notes (not blockers)**: (1) Document text goes into prompts — required by design; grounding rules + JSON-only + Zod mitigate instruction injection, but no explicit "ignore embedded instructions" clause exists. (2) `Secure` cookie follows `NODE_ENV`, so plain-HTTP LAN-IP use would rotate identity (localhost + HTTPS tunnel unaffected). (3) Caseworker gate is a shared demo code (`CASEWORKER_ACCESS_CODE`), appropriate for prototype only.

## F. PERFORMANCE ISSUES

- Full analysis ≈ 1–3 min (5+ sequential local Gemma calls); mitigated by 180s/call budget, per-stage token caps, chunking, persisted stage cache, claim-aware Q&A. Not a defect for the prototype, but demo pacing should assume it.
- Overlapping heavy analyses can pressure Ollama (observed one Ollama death under parallel burst); app degrades to clean 503, never fake data.
- No duplicate analysis: session reuse + persisted stages; analyze recomputes only on new input.

## G. FRONTEND REGRESSIONS

**None.** Since the portal redesign, frontend diffs are strictly additive or task-scoped: Stop button (asked), Stop/cleanup in VoiceOutput (asked), upload `accept` + formats caption + file chip (asked), result sections appended in existing patterns (asked), caseworker login gate (asked), scan stage relabels (asked). Deleted files (`DocumentSummary`, `StructuredFacts`, `SourceCard`) were dead code replaced by the portal redesign commit itself. No colors/layout/nav/typography/branding changes. All 9 routes 200 with design markers intact.

## H. EXACT NEXT FIXES (ordered, none applied)

1. Add explicit anti-prompt-injection clause to `GROUND_RULES` (`lib/ai/OllamaGemmaEngine.ts:77`).
2. Derive cookie `Secure` from request scheme (`lib/auth/identity.ts`) for plain-HTTP LAN use.
3. Claim-status promotion writer (supported/contradicted from verification results).
4. `Secure` note: rotate `CASEWORKER_ACCESS_CODE` default before any shared demo.
5. Surface bundle contents + eligibility submission via approved UI additions only.
