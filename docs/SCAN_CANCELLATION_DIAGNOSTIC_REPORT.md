# Scan cancellation diagnostic report — GovLens

## Exact source
- Message: `Cloud processing was cancelled. No document content was sent.`
- Source file/function: `app/scan/page.tsx`, `ScanForm.analyze()`, frontend consent gate:
  `if (!cloudConsent) { ... }`.
- The message is generated before `apiAnalyze()` is called, so no network request has started and no document text is sent to the GovLens backend or Gemini.

## Root cause
- The scan button requires the explicit cloud-processing consent checkbox to be checked.
- When it is unchecked, `cloudConsent` remains `false`, and `analyze()` returns immediately with the cancellation message.
- This is not an AbortController/Gemini outage; the backend path was verified separately with `cloudConsent: true`, resulting in a successful Gemini request.

## Processing stage reached
- Stage: frontend pre-request consent gate (`stage = pre_request`).
- Document sent to GovLens backend: no.
- Gemini request initiated: no.

## Cancellation classification
- Reason: `CONSENT_NOT_GRANTED`.
- Distinct from `REQUEST_TIMEOUT`, `NETWORK_FAILURE`, Gemini 503/504, and auth/configuration errors.

## Files modified
- `app/scan/page.tsx`: clearer consent-required message plus safe, secret-free diagnostic logs.
- `docs/SCAN_CANCELLATION_DIAGNOSTIC_REPORT.md`.

## Tests and checks
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: 255 tests passed.
- No automated browser scan test exists; browser verification remains manual.

## Steps to test document scanning
1. Start GovLens and open `/owner`.
2. Sign in with `OWNER_ACCESS_CODE`.
3. Open `/scan`.
4. Upload or capture a non-sensitive government test document.
5. Verify extracted text.
6. Check the explicit cloud-processing consent checkbox.
7. Click `Understand Document`.
8. Confirm progress stages and final result display.
9. To verify the consent gate, uncheck the box and click the button; confirm the consent-required message and that no request is sent.
10. Check browser/server logs for `component: "scan"` diagnostic entries (no document content is logged).