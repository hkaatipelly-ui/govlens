# GovLens — Current Architecture (safe baseline)

> Generated from a full repository inspection. This document describes what
> EXISTS and WORKS. Do not implement the future plan in
> `docs/NEW_ARCHITECTURE_PLAN.md` without a checkpoint commit first.

## 1. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14.2.5 (App Router), React 18, TypeScript 5 (strict) |
| Styling / UI | Tailwind CSS 3 + `gov-*` design tokens, PWA manifest, mobile-first |
| Database | SQLite via Node built-in `node:sqlite` (`lib/db/database.ts`), file at `DATABASE_PATH` (default `./.govlens-data/govlens.db`); JSON-file fallback exists only in legacy code paths |
| AI | Ollama at `http://localhost:11434`, model `gemma3:4b`, **server-side only** (browser never calls Ollama) |
| OCR | Tesseract.js 5, **browser-side** (`eng`+`tel`); server accepts normalized text |
| PDF / DOCX | `pdfjs-dist@3.4.120` (browser text-layer + page render; worker vendored at `public/pdf.worker.min.js`), `mammoth` (browser DOCX text) |
| Voice | Web Speech API: recognition + synthesis (`en-IN`, `te-IN`, `hi-IN`) |
| Validation | Zod 4 (API schemas + model-output schemas) |
| Tests / quality | Vitest (65 tests), `tsc --noEmit`, ESLint (`next/core-web-vitals`), `next build` — all green |

## 2. Data flow (end to end)

```
Camera / Upload (PDF,DOCX,JPG,JPEG,PNG)
  → client normalization (app/lib/ingestion.ts; images keep native camera path)
  → Browser OCR (Tesseract) for images/scanned PDFs; direct text for text-PDF/DOCX
  → POST /api/analyze (SSE stream of honest progress stages)
      → Gemma OCR cleanup → Gemma type check (A+B) + KnowledgeEngine.search (parallel)
      → Gemma vision (Stage C, image only) + Gemma structured extraction (parallel)
      → verification merge (D+E+F) → Gemma explanation
      → deterministic verbatim post-pass (ref/deadline/amount fill, explanation backfill)
      → session persisted
  → Result page: header facts, WHAT THIS DOCUMENT MEANS, DOCUMENT CHECK,
    IMPORTANT INFORMATION, DOCUMENTS REQUIRED, action steps, EN/TE tabs,
    voice Q&A, OFFICIAL INFORMATION panel (via POST /api/sources)
  → POST /api/cases (from session; AI action-plan enrichment w/ rule fallback)
  → Caseworker dashboard (access-code gated) / Documents register
```

Q&A (`POST /api/ask`): session-scoped (server checks session ownership),
evidence + cached extraction summary + conversation history, Telugu/Hindi
script + romanized-Telugu detection, grounded flag, exact unverified fallback.

## 3. API flow

| Route | Purpose | Auth |
|---|---|---|
| `POST /api/analyze` | Full pipeline, SSE (`reading→checking-type→finding-info→understanding→explaining→done`) | anonymous owner cookie (issued) |
| `POST /api/ask` | Session-scoped grounded Q&A | session must belong to cookie owner, else 404 |
| `POST /api/translate` | EN⇄TE via Gemma (numbers/dates preserved) | none needed |
| `POST /api/sources` | Full provenance for source IDs (never fabricated) | none needed |
| `GET/POST /api/cases` | Citizen list (**owner-scoped**) / create from own session | owner cookie |
| `GET/PATCH /api/cases/:id` | Citizen detail (owner-only, else 404) / status update (owner, or caseworker cookie) | owner / caseworker |
| `POST/GET/DELETE /api/caseworker/login` | Access-code gate (`CASEWORKER_ACCESS_CODE`), HttpOnly session cookie, status check, logout | code |
| `GET /api/caseworker/cases`, `GET /api/caseworker/cases/:id` | Full register + any detail | caseworker cookie, else 401 |
| `GET /api/health` | `{status, ollama, modelAvailable, model}` | none |

Key rule: identity comes **only** from server-managed HttpOnly cookies
(`govlens_user_id` UUID, `govlens_caseworker` HMAC token; `lib/auth/identity.ts`).
No ownerId from body/query is ever trusted.

## 4. Database schema (`lib/db/migrations.ts`, idempotent)

Tables: `sessions`, `documents`, `document_extractions`,
`conversation_messages`, `government_sources`, `knowledge_chunks`,
`cases`, `case_sources`, `checklist_items` (+ indexes on session/status/owner).

Ownership: `owner_id` on sessions, documents, document_extractions,
conversation_messages, cases, checklist_items. Pre-fix rows backfilled to
`owner_id='prototype-admin'`. Legacy pre-canonical `cases` tables are reset
(local demo data only).

Notable columns: `sessions.{verification_json, explanation_json, file_name,
file_type}`, `cases.{verification_json, explanation_json, qa_json,
file_name, file_type}`. No secrets stored. Seeds: 5-entry corpus
(Telangana MeeSeva/ration/Dharani + GoI Aadhaar/PM-KISAN) + terminology
aliases; chunks ~700 chars with keyword JSON.

## 5. Document pipeline (`app/lib/ingestion.ts`, client)

`validateFile` (extension-led, MIME-tolerant; 15 MB cap) →
`NormalizedDocument {id,fileName,fileType,mimeType,text,pages,originalSize,
language,firstPageImageDataUrl}`. Images: unchanged camera/Tesseract path.
Text PDFs: pdf.js text layer (+ page-1 render for vision). Scanned PDFs:
page render → Tesseract per page (max 10). DOCX: mammoth raw text.
Everything converges to normalized text into the single pipeline.

## 6. AI pipeline (`lib/ai/`, `lib/verification/`, `lib/extraction/`)

`AIEngine` interface → `OllamaGemmaEngine` (sole Ollama caller):
`cleanupOcrText`, `verifyGovernmentDocument` (text A+B, vision C),
`extractDocumentFields`, `explainDocument`, `answerQuestion`,
`translate`, `generateActionPlan`, (+`analyzeDocument` orchestrator).
Deterministic decoding: `temperature: 0`, JSON-schema `format`,
`num_predict: 512` (output cap only), 180s server timeout (`OLLAMA_TIMEOUT_MS`),
max 1 retry, Zod validation, controlled fallbacks (never fake data).

Verification (`GovernmentDocumentVerificationService`, stages A–F):
`verified` ONLY on strong corpus match (score + distinctive-term overlap);
content/vision alone cap at `likely_government`; failures → `uncertain`;
seals/logos are weak signals. Frontend gates `uncertain`/`not_government`
before the result page.

Grounding: every factual answer carries `sourceIds` + Grounded/Unverified
badge; insufficient evidence → exact unverified sentence (EN) /
document-scoped variant (Q&A).

## 7. Frontend routes (preserved as-is)

`/` portal home · `/scan` (capture/upload/OCR/verify-gate) · `/result`
(meaning, DOCUMENT CHECK, facts, docs, steps, EN/TE tabs, voice Q&A,
official sources, create case) · `/documents` (own register) ·
`/caseworker` + `/caseworker/:id` (login-gated full register/detail) ·
`/services` `/schemes` `/help` `/about`. Shared: GovHeader (EN/TE/HI +
A11y), GovFooter, Breadcrumb, VoiceInput/Output (Listen+Stop, no overlap).

## 8. Important dependencies

`next`, `react`, `tesseract.js`, `mammoth`, `pdfjs-dist`, `zod`,
`vitest`, `canvas` (dev-only, PDF tests), `eslint`/`eslint-config-next`.
No cloud AI, no vector DB, no auth framework, no backend framework beyond
Next.js route handlers. Secrets: none in repo (`.env*` git-ignored;
only `.env.example` + `deploy/env.production.example` templates).

## 9. Known limitations

- Full analysis ≈ 1–3 min (5 sequential local Gemma calls); overlapping
  heavy analyses can pressure Ollama — app degrades to 503, never fakes data.
- Quick-tunnel public URL rotates per restart (see `DEPLOY.md` Option B).
- Corpus is a 5-document demo seed; retrieval is keyword-based (no embeddings).
- `Secure` cookie flag follows `NODE_ENV`; plain-HTTP LAN-IP access would not
  persist identity (localhost + HTTPS tunnel unaffected).
- Phone camera/OCR/voice paths require a real browser (covered by
  `tests/e2e-checklist.md`, not automation).
