# GovLens Gemini sensitive-document policy

## Previous blocking rule
`GeminiEngine.ensureCloudSafeText()` blocked any sensitive document outright when it
matched the sensitive-content regex. `isSensitiveDocument()` now identifies the same
class of content, and blocked results are reported as `SENSITIVE_DOCUMENT_BLOCKED`.

## New privacy configuration
- `GEMINI_DATA_PROTECTION_MODE` defaults to `unpaid`.
- `GEMINI_PAID_API_BILLING_CONFIRMED` defaults to `false`.
- `GEMINI_ALLOW_SENSITIVE_DOCUMENTS` defaults to `false`.

Sensitive processing is allowed only when all of the following are true:
- `GEMINI_ENABLED=true`
- a valid server-side API key exists
- `GEMINI_DATA_PROTECTION_MODE=paid`
- `GEMINI_PAID_API_BILLING_CONFIRMED=true`
- `GEMINI_ALLOW_SENSITIVE_DOCUMENTS=true`
- the user explicitly consents (`cloudConsent=true`)

The billing flag is an administrator declaration, not automated proof of Google
Cloud billing.

## What remains blocked
- Unpaid mode blocks sensitive document transmission.
- Incomplete paid-mode configuration blocks it.
- Missing API key, missing consent or declined consent blocks it.
- Client-supplied flags cannot bypass the policy.

## Files changed
- `lib/ai/geminiPrivacy.ts`
- `lib/ai/GeminiEngine.ts`
- `app/api/analyze/route.ts`
- `app/scan/page.tsx`
- `.env.example`

## Tests and build
- Lint passed
- Typecheck passed
- 255 tests passed
- Production build passed

## Limitations
- Paid-tier status must be verified independently by the operator.
- Ordinary automated tests use mocked Gemini responses and do not make live calls.