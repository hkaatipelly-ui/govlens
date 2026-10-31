# Scan consent UI fix report — GovLens

## Root cause
- The cloud-consent checkbox existed only inside a card gated by `ownerAuth`.
- For a non-owner session, or before owner status resolved, the card was hidden, so the UI displayed the consent-required error while rendering no checkbox.

## Change
- Render the consent card unconditionally during review/understanding phases.
- Added a clearly visible, accessible checkbox (`#cloud-consent-checkbox`) with an associated label.
- Wording: "I consent to sending this document and its extracted text to Google Gemini for cloud-based analysis."
- Added explanatory sentence: "Your document and extracted text will be sent to Google's Gemini service for processing. Do not continue unless you agree."
- Consent remains unchecked by default.
- Reset `cloudConsent` whenever a new document is selected/captured or Retake is used.
- Updated outdated "local AI" wording to reflect Google Gemini.

## Privacy and processing behavior
- No request is sent when consent is unchecked.
- Backend still requires `cloudConsent === true`.
- Sensitive-document protections and owner access remain enforced.
- Consent is not a bypass for sensitive restrictions.

## Checks
- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm run build`: passed
- `npm test`: 255 passed

## Visual verification
- Dev/build app and inspect `/scan` after capturing a document: consent checkbox appears directly above `Understand Document` and is unchecked by default.