# GovLens — Implementation Notes

Decisions taken where architecture.md was ambiguous or where the simplest working approach was chosen.

## 1. Architecture summary (as implemented)
- Mobile-first Next.js 14 + TypeScript + Tailwind PWA shell (`/` phone UI, `/caseworker` dashboard).
- `AIEngine` interface + `OllamaGemmaEngine` (only place that talks to Ollama at `http://localhost:11434/api/chat`, model `gemma3:4b` via `OLLAMA_BASE_URL`/`OLLAMA_MODEL` env overrides).
- `OCRService` (Tesseract.js, browser-only), `VoiceService` (Web Speech API, en-IN/te-IN), `KnowledgeEngine` (keyword + terminology-alias retrieval over local JSON), `ActionEngine` (checklist from extraction + evidence), case persistence via `CaseStore`.
- API: `POST /api/analyze`, `POST /api/ask`, `GET/POST /api/cases`, `GET /api/health`.

## 2. Deviations / simplifications (all consistent with architecture.md)
1. **OCR runs client-side, not on the server.** `POST /api/analyze` accepts `{ text, language }` (OCR'd text) instead of `{ document: File }`. Reason: Tesseract.js in Node needs native binaries and model downloads; browser-side OCR is the documented local-first approach and works offline after first load. Server never sees raw images.
2. **Persistence: SQLite via Node built-in `node:sqlite`, with JSON-file fallback.** No `better-sqlite3` native dependency (avoids build failures on hackathon laptops). If `node:sqlite` is unavailable, `JsonFileCaseStore` keeps the identical `Case` shape in `.govlens-data/cases.json`.
3. **Repo paths follow architecture.md** (`app/components`, `app/lib`, `app/types`, `app/data`, `app/services`) — these are colocated under Next App Router's `app/` dir; folders without `page.tsx`/`route.ts` are not routes.
4. **Phone-to-laptop transfer = same Next.js origin.** Cases created on `/` appear on `/caseworker`; on a real phone+laptop demo, expose the dev server via LAN (`next dev -H 0.0.0.0`) and open the laptop URL. No extra sync infra per prototype constraints.
5. **`format: "json"` requested from Ollama**, then `validateAnalysisJson()` enforces schema before rendering. Malformed JSON → generic unverified fallback (keeps sources, never invents facts). No cloud fallback, ever — Ollama errors surface as HTTP 503 + red "Local AI unavailable" banner.

## 3. Genuine blockers encountered
- None architectural. Environment notes: Ollama server was down at start (fixed: `ollama serve`); only `deepseek-r1:14b` was installed, `gemma3:4b` pull started in background. App degrades gracefully until the model exists (`/api/health` reports exact fix command).
- Tesseract Telugu (`tel`) traineddata downloads on first OCR use (needs internet once); English works immediately. Manual text entry always available as fallback.

## 4. Verification
- `npm run typecheck` and `npm run build` after each phase (see terminal log).
- Demo path tested: upload → OCR → analyze → facts → "What documents do I need?" → Telugu toggle → create case → /caseworker.

## 5. Frontend redesign (government citizen-service portal)
- Presentation layer only; backend untouched (OCRService, AIEngine/OllamaGemmaEngine,
  KnowledgeEngine, ActionEngine, case APIs, government JSON data all unchanged).
- Palette: navy #123B63, blue #1E5AA8, saffron #F39A2F, green #2E8B57 (+ light/off-white
  variants) as Tailwind `gov.*` tokens in `tailwind.config.ts` + `.gov-*` utilities.
- Chrome: `GovHeader` (top info bar with EN|TE|HI + A-/A/A+/contrast, emblem header,
  blue nav, saffron rule), `GovFooter`, `Breadcrumb`, `StatusBadge`, `HealthNotice`.
- Routes: `/` portal home (hero, notice strip, Popular Services, How It Works, official
  info), `/scan` (breadcrumb, capture, 4-step processing tracker, instructions),
  `/result` (header facts, WHAT THIS DOCUMENT MEANS, IMPORTANT INFORMATION table,
  DOCUMENTS REQUIRED, action steps, EN/TE explanation tabs, voice Q&A, green-bordered
  OFFICIAL INFORMATION panel fed by new `POST /api/sources` metadata endpoint),
  `/documents` (filterable register), `/services`, `/schemes` (renders corpus docs),
  `/help`, `/about`, `/caseworker` (stats + case register table) + case detail
  (LEFT original document / RIGHT AI understanding).
- Cross-page citizen state via `app/lib/session-store.ts` (memory + sessionStorage);
  portal language/a11y via `PortalProvider` (persisted to localStorage).
- Hindi: full header + voice support; `/api/ask` tags `[Reply in Hindi]` which the
  engine honours (script detection covers typed Telugu/Hindi); TTS locales en-IN,
  te-IN, hi-IN. Analysis summaries remain EN (+TE from the model).
- Verified end-to-end on `gemma3:4b`: analyze (Telugu summary + grounded doc list),
  ask in EN/TE/HI (all grounded), create case → register → detail (HTTP 200s).

## 6. Backend + integration (Next.js Route Handlers + SQLite + Ollama, no extra infra)
- Canonical modules under `lib/`: `ai/` (AIEngine interface + OllamaGemmaEngine,
  server-only, env config, JSON mode, Zod validation, 1 retry, controlled fallback),
  `ocr/` (interface + browser Tesseract impl; server accepts normalized OCR text),
  `knowledge/` (interface + LocalKnowledgeEngine + chunker + search; SQLite-seeded
  corpus, swappable for embeddings later), `extraction/` (Zod schemas),
  `voice/` (browser impl; backend receives text only), `actions/`, `cases/`
  (CaseService), `sessions/` (per-scan Q&A isolation), `db/` (database + migrations),
  `sources/` (SourceService provenance), `validation/` (apiSchemas).
- Old `app/lib/{ai-engine,knowledge-engine,case-management}` removed; `app/lib`
  OCR/voice/action files are thin re-export shims. Browser never calls Ollama.
- APIs: session-based `POST /api/analyze` (ONE model call), `POST /api/ask`
  (ONE call, session-scoped, Telugu/Hindi script detection), `POST /api/translate`,
  `POST /api/sources`, `GET/POST /api/cases`, `GET/PATCH /api/cases/:id`,
  `GET /api/health` → `{status, ollama, modelAvailable, model}`.
- Errors: 400 validation, 404 unknown case, 422 no context, 503 Ollama/model
  missing with fix instructions, 500 DB failures. Never fake data.
- Tests: 32 vitest cases (`tests/`) + manual checklist (`tests/e2e-checklist.md`).
- Env: `.env.example` (OLLAMA_BASE_URL/MODEL, DATABASE_PATH, NEXT_PUBLIC_APP_URL);
  `npm run dev:lan` / `start:lan` bind 0.0.0.0 for phone→Mac testing.

## 7. Final AI integration pass (Gemma 3 4B deep integration)
- Engine (`lib/ai/OllamaGemmaEngine`, behind `AIEngine`): 7 real methods —
  cleanupOcrText, verifyGovernmentDocument (text A+B + vision C via Ollama
  `images[]`), extractDocumentFields, explainDocument, answerQuestion
  (+extraction summary + history), translate (preserves numbers/dates),
  generateActionPlan. Deterministic decoding (temperature 0, JSON-schema
  `format` for extraction/explanation), server-side timeouts (AITimeoutError),
  max 1 retry, Zod validation, no browser→Ollama calls anywhere.
- Verification (`lib/verification/`): 6-stage service (A classify, B likelihood,
  C vision, D retrieval, E source match, F merge). "verified" ONLY on strong
  corpus match (score + distinctive term overlap); text/vision alone cap at
  "likely_government"; failures → "uncertain". Seals/logos treated as weak signals.
- Pipeline (`POST /api/analyze`, SSE with honest stages reading→checking-type→
  finding-info→understanding→explaining): cleanup → verify+retrieve (parallel) →
  vision+extract (parallel) → merge → explain (timeout degrades to deterministic
  fallback). Deterministic verbatim post-pass (`lib/extraction/postprocess`)
  fills model-conservative nulls (ref/deadline/amount) from document substrings.
- Scan page sends downscaled JPEG (`app/lib/image.ts`) + verification gate
  (uncertain → Continue anyway + banner; not_government → rescan only). Result
  shows DOCUMENT CHECK (status/confidence/detected/matched sources/note) +
  explanation points. Cases store verification/explanation/QA; caseworker shows
  verification block + Q&A; case creation enriches checklist via AI action plan
  (rule-based fallback). Q&A detects Telugu script + romanized Telugu
  ("Naku emi documents…") and Hindi script.
- Live-verified on gemma3:4b: gov doc → verified(0.95) + grounded extraction;
  receipt → not_government gate; OCR-noise → cleaned + verified; synthetic image
  → vision signals + likely_government; romanized Telugu Q → Telugu grounded
  answer. 47 vitest cases pass; `tsc`, `next build` clean.

## 8. Multi-format ingestion (PDF/DOCX/JPG/JPEG/PNG) — surgical extension
- New client module `app/lib/ingestion.ts` (DocumentIngestion concept):
  `validateFile` (extension decides, MIME tolerated; 15 MB cap),
  `normalizeDocumentFile` → NormalizedDocument {id,fileName,fileType,mimeType,
  text,pages,originalSize,language,firstPageImageDataUrl}. Images keep the
  untouched camera/Tesseract path; text PDFs use pdf.js text layer; scanned
  PDFs render pages→existing OCR with `[Page N]` boundaries (max 10 pages);
  DOCX uses mammoth (no OCR). Deps: `pdfjs-dist@3.4.120` (worker copied to
  `public/pdf.worker.min.js`, no CDN), `mammoth`; `canvas` is dev-only for tests.
- One downstream pipeline: normalized text (+first-page vision image) → the
  unchanged verify→RAG→Gemma→result flow. Verification statuses/rules, prompts,
  model, RAG untouched.
- Minimal UI: upload accepts `.pdf,.docx,.jpg,.jpeg,.png`; "Supported: PDF,
  DOCX, JPG, JPEG, PNG" caption; file chip (name/type/size); result header shows
  Document/Type chip. Camera unchanged.
- Persistence: nullable `file_name`/`file_type` on sessions+cases (old records
  unaffected); controlled errors for corrupt/protected/empty/oversized/unsupported.
- Added repo ESLint config (was absent) so `npm run lint` passes clean.
- Verified: 62 vitest (incl. pdf.js text-layer + mammoth + validation tests),
  `tsc`, `lint`, `build` clean; live: PDF text→verified, DOCX→verified+fields,
  private DOCX→not_government, DOCX case stores fileName/verification.
