# GovLens 9-minute Gemini timeout

## Timeout layers
1. Google SDK transport (`sdkTransport`): `httpOptions: { timeout: call.timeoutMs }` plus an application `AbortController`/`Promise.race` race at the same configured value.
2. `geminiTimeoutMs()`: reads and validates `GEMINI_TIMEOUT_MS`; invalid/unset values safely default to 540000.
3. `@google/genai` retry behavior is retained but not duplicated by application code.

## Effective timeout
- Default and fallback: 540000 ms (9 minutes)
- Configured environment value is honored when finite and positive.

## Tests and build
- lint passed
- typecheck passed
- 255 tests passed
- build passed

## Remaining limitations
- Google's backend may independently return HTTP 504 if it cannot finish within its own
  internal deadline; the client timeout cannot prevent that upstream result.