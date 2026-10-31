# GovLens Gemini timeout fix

## Root cause
Although `geminiTimeoutMs()` read `GEMINI_TIMEOUT_MS`, `sdkTransport()` did not pass that
value into the Google SDK as an HTTP option. The SDK's request path therefore used a
fallback/default timeout, producing "Gemini did not respond within 25000 ms." The
application-level abort race used the configured value, but the SDK itself could
cancel earlier.

## Files changed
- `lib/ai/GeminiEngine.ts`
  - config now includes `httpOptions: { timeout: call.timeoutMs }`
  - default `geminiTimeoutMs` value remains 90 seconds when unset/invalid
- `docs/GEMINI_TIMEOUT_FIX_REPORT.md`

## Effective timeout
- `GEMINI_TIMEOUT_MS` (default 90000) is now honored by the SDK request itself.
- Explicit `AbortController` race remains bounded to the same value.
- Invalid/unset values safely fall back to 90 seconds.

## Tests
- 255 tests passed
- lint, typecheck and production build passed

## Limitations
- No live Gemini request was performed.
- SDK/server-side limits beyond the configured timeout may still apply.