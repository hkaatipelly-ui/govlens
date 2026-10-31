# Gemini provider wiring and verification audit

## 1. TL;DR / final verdict

Gemini is **already wired as the only public-service Q&A cloud provider** in the current implementation. The public Q&A route does not merely import Gemini-looking files; it calls the following runtime chain:

1. `app/services/PublicAskCard.tsx` -> `apiPublicAsk()` in `app/services/api.ts`
2. `POST /api/ask` in `app/api/ask/route.ts` -> `publicServiceAnswer()` -> `answerPublicServiceQuestion()` in `lib/qa/publicServiceQa.ts`
3. `answerPublicServiceQuestion()` retrieves curated KB/service records, then calls the provider resolver `requirePublicQnAI()` from `lib/ai/providerPolicy.ts`
4. `requirePublicQnAI()` calls `geminiConfigurationIssue()` in `lib/ai/GeminiEngine.ts`; if configured/enabled, returns `getGeminiEngine()`
5. `answerPublicServiceQuestion()` calls `engine.answerQuestion()`
6. `GeminiEngine.answerQuestion()` validates privacy, calls `structuredCall()`
7. `structuredCall()` calls `sdkTransport()`
8. `sdkTransport()` reads `geminiApiKey()`, `geminiModel()`, `geminiTimeoutMs()`, and calls `ai.models.generateContent({ model: geminiModel(), ... })` using `@google/genai`
9. Returned JSON is parsed and validated with `groundedAnswerSchema`
10. `answerPublicServiceQuestion()` preserves source metadata from retrieval and assembly, never from model text

No live Gemini API request was made in this audit. All provider tests use transport mocks. No secrets or live smoke tests were run.

## 2. Gemini registration / wiring

**Registered:** Yes, through the existing single AI abstraction:

- Interface: `AIEngine.answerQuestion` in `lib/ai/AIEngine.ts`
- Local implementation: `OllamaGemmaEngine.answerQuestion()` in `lib/ai/OllamaGemmaEngine.ts`
- Cloud implementation: `GeminiEngine.answerQuestion()` in `lib/ai/GeminiEngine.ts`

Gemini is not a separate route or separate frontend path. It is selected centrally by `requirePublicQnAI()` from `lib/ai/providerPolicy.ts`.

The route never reads `provider` from the request. `askRequestSchema` in `lib/validation/apiSchemas.ts` has no `provider` field, and `publicServiceAnswer()` ignores everything except `question` and `language`.

The public path calls Gemini only after:
- deterministic intent handling in `answerPublicServiceQuestion()`
- `screenPublicQuestion()` privacy check
- retrieval over curated public records
- evidence gating (`retrieval.sources.length > 0`)
- `requirePublicQnAI()` configuration gate

## 3. Two AI modes

OWNER PRIVATE MODE:
- Entry: `app/api/ask/route.ts`, when `sessionId` or `documentText` is supplied
- Gate: `requireOwnerLocalAI(isOwner())`
- Provider: Ollama/Gemma via `OllamaGemmaEngine.getAIEngine()`
- Purpose: private document analysis on the owner's machine
- Privacy: Ollama is never auto-started; unavailable Ollama surfaces an error

PUBLIC CLOUD MODE:
- Entry: `app/api/ask/route.ts` when neither `sessionId` nor `documentText` is supplied
- Gate: `requirePublicQnAI()`
- Provider: `GeminiEngine` + `@google/genai`
- Purpose: non-sensitive public-service Q&A over curated public records
- Safety: retrieval only over curated records; private uploaded documents are never sent

No silent fallback in either direction. `requirePublicQnAI()` throws when Gemini is disabled/unconfigured instead of calling `getAIEngine()`. `requireOwnerLocalAI()` returns only the local engine and has no Gemini branch.

## 4. Provider configuration

Central functions in `lib/ai/GeminiEngine.ts`:
- `geminiApiKey()` reads `process.env.GEMINI_API_KEY` server-side (nullable)
- `geminiModel()` reads `process.env.GEMINI_MODEL`, defaulting to `gemini-3.8-flash`
- `geminiEnabled()` returns `process.env.GEMINI_ENABLED === "true"`
- `geminiTimeoutMs()` and `geminiMaxOutputTokens()` read their respective env keys with defaults
- `geminiConfigurationIssue()` centralizes the enabled/key check
- `checkGeminiHealth()` is passive and does not perform network access or consume quota

As of the docs checked 2026-10-28, `gemini-3.8-flash` is a valid current Google Gemini model ID (`gemini-3.8-flash`). It is read from configuration and is not hard-coded at the call site: `sdkTransport()` passes `geminiModel()` to `ai.models.generateContent({ model: ... })`.

`getClient()` uses `@google/genai` with the server-side `GEMINI_API_KEY`.

No `NEXT_PUBLIC_` Gemini variable is used. No client component imports the SDK or holds a key. Health returns configured/enabled/model/outcome only and never returns the API key or private content.

## 5. Privacy and source grounding

Public Q&A uses:
- Phase 4 privacy screen in `answerPublicServiceQuestion()` before transmission
- Additional Phase 4 privacy rules in `screenPublicQuestion()` (`lib/ai/geminiPrivacy.ts`)
- curated KB chunks retrieved by `KnowledgeEngine.search()`
- reviewed service-directory records converted into evidence via `synthesizeServiceHit()`

Source metadata survives from retrieval/assembly:
- `AnswerSource` in `lib/qa/publicServiceQa.ts` contains `sourceId`, `title`, `url`, `sourceType`, `lastReviewed`, `relevantExcerpt`
- metadata is read from the service directory/`government_sources` rows
- the model cannot emit authoritative source metadata because the response's `sources` array is assembled by the server, not copied from model text

If retrieval returns no usable evidence, `answerPublicServiceQuestion()` returns `unsupported_no_evidence` without calling Gemini. If retrieval is insufficiently relevant, the answer is marked unsupported while still showing retrieved sources. Conflicting source links/review dates produce an explicit caution and reference to the authoritative source.

`sanitizeAnswerUrls()` also blanks URLs that appear in model-generated answer text when they were not part of the retrieved source set.

## 6. Health and provider status reporting

`GET /api/health` in `app/api/health/route.ts` distinguishes:
- Ollama unavailable or running without the expected model
- Gemini disabled
- Gemini enabled but missing API key
- Gemini configured but not yet connection-tested
- prior Gemini error outcome

Health checks do not start Ollama and do not call Gemini. They do not print credentials or private data.

## 7. Missing integration points found

No broken runtime path or missing registration was found in the current code. The following are not integration defects but operational/pre-deployment requirements:
- `GEMINI_ENABLED` defaults to `false`, so successful Gemini answers are not served unless the operator explicitly enables it and supplies a key.
- Gemini answers are tested only with mocked/injected transports. No live request was made in tests or during this audit.
- Health reporting uses only the last request outcome; a wholly fresh server reports "configured ... no request has been made yet."
- The client tracker and API-error mapping depend on a returned `AIPolicyError`/`GeminiError`; normal application behavior handles these.

## 8. Exact files inspected/changed

Wiring-related files inspected:
- `lib/ai/GeminiEngine.ts`
- `lib/ai/OllamaGemmaEngine.ts`
- `lib/ai/providerPolicy.ts`
- `lib/ai/geminiPrivacy.ts`
- `lib/qa/publicServiceQa.ts`
- `app/api/ask/route.ts`
- `app/api/health/route.ts`
- `app/services/api.ts`
- `app/components/PublicAskCard.tsx`
- `tests/gemini-provider.test.ts`
- `tests/owner-ai-policy.test.ts`
- `tests/public-service-qa.test.ts`
- `.env.example`, `deploy/env.production.example`, `package.json`

Code behavior was already correct. During this audit, no functional code was intentionally changed beyond verification and creation of this report; prior project files contain the complete implementation.

## 9. Unit/mock test results

Commands run after this verification:
- `npm run lint`: passed (`✔ No ESLint warnings or errors`)
- `npm run typecheck`: passed (`tsc --noEmit`)
- `npm test`: passed (`250 passed`, 21 test files)
- `npm run build`: passed (Next.js production build)

Relevant provider coverage:
- `tests/gemini-provider.test.ts`: disabled/configured checks, structured response handling, invalid JSON/invalid fields retry, blocked/safety handling, timeout, rate limiting, auth errors, no fallback model substitution, and schema behavior
- `tests/owner-ai-policy.test.ts`: owner-only Ollama, public path Gemini-only, policy rejection mapping, user isolation
- `tests/public-service-qa.test.ts`: disabled/unconfigured provider surfaces as 503, supported answers use retrieved source metadata, conflicting source handling, source sanitization, privacy blocking, unsupported/no-evidence states

## 10. Live API result

No live Gemini API request was made. Therefore no successful real provider response exists as evidence in this report.

To run a genuine smoke test after configuring a secret server-side:
1. Export `GEMINI_ENABLED=true`
2. Export a real `GEMINI_API_KEY`
3. Keep `GEMINI_MODEL` at the configured value (default `gemini-3.8-flash`)
4. Send a non-sensitive question such as: `What documents are needed for an income certificate?`
5. Confirm the returned `answer`, `supported`, `limitations`, and `sources` contain metadata only from curated records

Do not expose the key in Git, logs, or terminal output when doing so.

## 11. Remaining limitations

- Gemini is inert unless both `GEMINI_ENABLED=true` and a valid key are supplied; this is intentional.
- No live quota-consuming test ran in this environment.
- `getClient()` caches a `GoogleGenAI` instance for the process; changing `GEMINI_API_KEY` requires an app restart to re-create the client.
- Provider and public Q&A behavior depend on configured network access to the Gemini API.
- The report cannot claim a live integration succeeded because no live authenticated request was received and validated.
PY