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
