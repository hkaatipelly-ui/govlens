# GovLens Gemini timeout diagnosis

## Source of the 25000 ms timeout
The error `Gemini did not respond within 25000 ms` came from `classifyGeminiFailure()` in
`lib/ai/GeminiEngine.ts`, generated when an aborted request reached `geminiTimeoutMs()`'s
default value of `25_000`. `geminiTimeoutMs()` reads `GEMINI_TIMEOUT_MS`, but `.env.local`
did not set it, so every Gemini call used the 25-second default.

## Files changed
- `lib/ai/GeminiEngine.ts` — default timeout changed from 25000 to 90000
- `.env.example`
- `deploy/env.production.example`

## Effective timeout
- Default `GEMINI_TIMEOUT_MS`: 90000 ms
- Environment-configured values are still honored and bounded by `Number.isFinite`/positive checks.
- No timeout protection was disabled.

## Results
- Lint, typecheck, tests and build must be rerun after this change.
- No real Gemini API request was made.