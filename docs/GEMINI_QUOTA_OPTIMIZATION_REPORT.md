# Gemini quota optimization report — GovLens

## Original per-scan Gemini usage (observed from implementation)
A typical document scan could make these Gemini requests:
1. `cleanupOcrText` — 1 request.
2. `verifyGovernmentDocument` (text) — 1 request.
3. `verifyGovernmentDocument` (image) — 1 request when an image is available.
4. `extractDocumentFields` — 1 request, or up to 4 for chunked large documents.
5. `explainDocument` — 1 request.
6. `analyzeDeep` — 1 request.

Approximate original range: 5-10 Gemini requests per scan, with repeated OCR/document text in multiple calls. Additional attempts occur when HTTP 503 requires retries. The only real-key steady-state token count was not destructively instrumented across a full scan, so no fabricated savings are claimed. Per-request token counts are now logged safely from SDK usage metadata.

## Issues found
- Multiple compatible stages each sent document text and output separately instead of one full structured request.
- Application plus SDK retry logic was redundant until SDK retries were disabled.
- Daily quota exhaustion risk was initially indistinguishable from temporary rate limits.

## Changes made
- SDK retry layer remains disabled (`retryOptions: { attempts: 1 }`) so only GovLens bounded retry applies.
- Daily quota exhaustion is not retried; temporary 503 handling remains bounded.
- Frontend `analyze` uses a ref guard, preventing duplicate overlapping scans from double clicks/re-render.
- Per-request SDK usage metadata and elapsed time are logged without prompts/document text/API keys.
- Extracted/scanned text remains available on errors, avoiding forced re-upload after temporary quota failures.

## Quota error classification
- Temporary rate limit: bounded backoff where retry guidance exists.
- Daily quota exhausted: no retry, scan stops calling Gemini.
- 503: small bounded exponential backoff with jitter.
- 401/403/400: not retried; configuration/auth error.

## Accuracy/evidence preservation
- No pages skipped.
- No document text truncated for quota.
- OCR languages preserved.
- Verification remains mandatory.
- Privacy, consent, sensitive-document restrictions, and owner-only access remain enforced.
- No provider fallback added.

## Privacy and diagnostic checks
- Logs contain no prompts, OCR text, extraction contents, document contents, API keys, or authorization headers.
- Correlation IDs and safe error categories are available.

## Remaining limitations
- Full Gemini request consolidation cannot be responsibly completed in this pass without broader SDK structured-output validation and accuracy regression tests. The current pipeline still makes multiple requests, so quota reduction is not claimed as complete.
- Real Gemini quota recovery requires account/billing quota status.