# Gemini failure diagnostic report — GovLens

## Exact source of generic message
- Generic user-facing message:
  `Google Gemini is temporarily unavailable. Your analysis could not be completed. Please try again shortly.`
- Produced by: `classifyGeminiFailure()` in `lib/ai/GeminiEngine.ts` for HTTP 503.
- API route masking: `app/api/analyze/route.ts` previously caught `GeminiError` (subclass of `AIEngineUnavailableError`) as generic `AI_UNAVAILABLE` with status 503, discarding the more specific status/code. This is now fixed.

## Underlying error classification
- HTTP 429: rate-limited vs quota-exhausted (message differentiation), no retry unless `Retry-After` present.
- HTTP 503: transient service unavailable, retried with bounded backoff.
- HTTP 504: distinguished as Google-side/application deadline exceeded, not silently converted to generic 503.
- Application timeout (`AbortError`/timeout): classified as timeout with HTTP 504.
- Auth (401/403), configuration (400), model-not-found (404), malformed request: not retried.

## GEMINI_TIMEOUT_MS application
- `geminiTimeoutMs()` validates finite positive numeric env and defaults to 540000 when absent/invalid.
- `sdkTransport()` passes the value to `httpOptions.timeout` and the application `Promise.race` timer, with the SDK's own retry disabled (`retryOptions.attempts = 1`).
- Therefore `.env.local` value `GEMINI_TIMEOUT_MS=540000` is actually applied to the SDK request when parsed server-side.

## Other timeout layers
- Application timer in `sdkTransport()` (same configured value).
- Browser/SSE client read timeout (outside server control).
- Google backend deadline (cannot be extended by client).
- SDK internal timeout disabled/replaced by request option.

## Files changed
- `lib/ai/GeminiEngine.ts`
- `app/api/analyze/route.ts`
- `docs/GEMINI_504_DIAGNOSIS.md`
- `docs/GEMINI_FAILURE_DIAGNOSTIC_REPORT.md`

## Test, lint, typecheck, build
- `npm test`: 22 files / 255 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed (no ESLint warnings or errors).
- `npm run build`: passed.

## Real Gemini request
- No real request was run automatically. Manual smoke test available via `npm run test:gemini`.

## Live test timeout
- The 60,000 ms failure was caused by `vitest.live.config.ts` (`testTimeout: 60000`), not by the Gemini transport.
- It is now `GEMINI_TIMEOUT_MS + 30000` ms, with a 540000 ms fallback if omitted/invalid.
- The nine-minute application timeout is present in `geminiTimeoutMs()` and is passed to `httpOptions.timeout` plus the AbortController race in `sdkTransport()`. The SDK's own retry layer is disabled.

## Remaining blocker
- Actual Google service recovery/quota/billing status cannot be determined locally. Server logs should be checked with the returned `correlationId`.
