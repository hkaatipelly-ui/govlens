# GovLens Gemini-only migration report

## Architecture after migration
GovLens now uses Google Gemini as its single active AI provider. Document analysis,
structured extraction, OCR cleanup, verification, explanation, deep analysis,
action plans and public-service Q&A route through `GeminiEngine` via the common
`AIEngine` abstraction. The legacy `OllamaGemmaEngine` implementation and its
localhost:11434 health code path are no longer registered or invoked by the active
application runtime.

Owner-only document scanning is preserved; authorization and user isolation are
unchanged. Cloud consent is required before document text is sent to Gemini.

## Files modified for this migration
- `lib/ai/OllamaGemmaEngine.ts` — legacy `getAIEngine()` now resolves to `GeminiEngine`
- `lib/ai/providerPolicy.ts` — owner path returns `GeminiEngine`
- `app/api/analyze/route.ts` — Gemini-only analysis, consent enforcement, no Ollama preflight
- `app/api/health/route.ts` — Gemini status instead of Ollama health
- `lib/validation/apiSchemas.ts` — removed `provider` selection from analyze contract
- `app/scan/page.tsx` — removed provider dropdown; Gemini indicator + cloud consent
- `app/components/HealthNotice.tsx` — Gemini status messaging
- `app/about/page.tsx` — updated AI provider description
- `tests/owner-ai-policy.test.ts`, `tests/gemini-provider.test.ts`, `tests/sensitive-document-provider.test.ts` — aligned to Gemini-only behavior
- `.env.example` (existing) documents Gemini variables

## Obsolete Ollama paths
- `checkOllamaHealth` and `ollamaBaseUrl` remain only inside the legacy
  `OllamaGemmaEngine.ts` file. They are not called by active application code.
- `lib/ai/OllamaGemmaEngine.ts` is retained only because it contains shared
  prompt builders, JSON schemas and error classes reused by `GeminiEngine`. It is
  not registered as an active provider.

## Remaining references
- `lib/ai/OllamaGemmaEngine.ts` — intentionally retained, shared/unreachable
  implementation; not registered or invoked by active runtime paths.
- Prompt builder functions reused by `GeminiEngine`.
- Documentation references are historical only.

## Gemini configuration
Set server-side:
- `GEMINI_ENABLED=true`
- `GEMINI_API_KEY=<server secret>`
- `GEMINI_MODEL` (default configured model)
- `GEMINI_TIMEOUT_MS`
- `GEMINI_MAX_OUTPUT_TOKENS`

Never expose the key via `NEXT_PUBLIC_*`, logs or responses.

## Cloud privacy/consent
Document contents are transmitted to Google Gemini only after explicit
`cloudConsent=true`. Declining consent cancels analysis and no document text is sent.

## Document support
PDF, DOCX, JPEG/JPG/PNG and pasted text continue through the existing OCR and
normalization pipeline into Gemini-backed extraction and analysis.

## Test results
Lint, typecheck, unit tests and production build pass. No live Gemini API
request was made during validation.

## Known limitations
- Legacy Ollama code remains on disk as shared utilities but is inactive.
- Live Gemini smoke testing requires a real server-side API key and is opt-in.
- Consent events are validated at the API boundary; full audit logging can be
  extended without schema migration.