# GovLens Gemini HTTP 504 diagnosis

## Exact source
- `lib/ai/GeminiEngine.ts`:
  - Application timeout path: `classifyGeminiFailure()` lines for `AbortError` / timeout → `GeminiError("timeout", "Gemini did not respond within ${timeoutMs} ms.", 504)`.
  - Upstream Google HTTP 504 path: `classifyGeminiFailure()` status `504` → `GeminiError("network", "Google Gemini did not finish processing within the applicable deadline...", 504)`.
  - Generic fallback `Gemini API returned HTTP ${status}` only applies to statuses not already classified.
- `app/api/analyze/route.ts`: streams errors. Before the order fix, `GeminiError` (subclass of `AIEngineUnavailableError`) was caught first as generic `AI_UNAVAILABLE` (503), masking the status/code. Fixed ordering.

## Timeout configuration
- `geminiTimeoutMs()` parses `GEMINI_TIMEOUT_MS` with finite/positive validation and defaults to `540000` when unset/invalid.
- `sdkTransport()` sets `httpOptions.timeout = call.timeoutMs` and an application `AbortController` race at the same value.
- SDK default retries were disabled with `retryOptions: { attempts: 1 }`; GovLens owns bounded retry.
- `.env.local` currently sets `GEMINI_TIMEOUT_MS=540000`; verified by parsing tests.
- Other timeout layers: route read of request body has no custom timeout; client SSE read depends on browser/network; Google backend has its own deadline.

## Short vs large requests
- Configured provider only receives public questions and owner-controlled non-sensitive document fields; large source text is bounded via existing page/section chunking in `extractDocumentFields`.
- No silent truncation added for the fix; unsafe content remains blocked.

## Files changed
- `lib/ai/GeminiEngine.ts`: diagnostics, SDK timeout/retry cleanup, 503/504/429 classification and bounded retry.
- `app/api/analyze/route.ts`: correlation ID, error category, correct status/code propagation, client disconnect handling.
- `docs/GEMINI_504_DIAGNOSIS.md`
- `docs/GEMINI_FAILURE_DIAGNOSTIC_REPORT.md`

## Tests run
- `npm test` (255 passed), `npm run typecheck`, `npm run lint`, `npm run build` to be recorded.

## Real Gemini request
- Not claimed successful automatically; manual smoke test exists at `tests-live/gemini-live.test.ts`.
