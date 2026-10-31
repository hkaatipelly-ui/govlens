# GovLens document privacy and size fix

## Root cause of stale Ollama policy message
The message originated from `GEMINI_PRIVACY_REFUSAL` in `lib/ai/GeminiEngine.ts`. It
described Gemini as disallowed and directed users to owner-controlled Ollama/Gemma,
even though Ollama is no longer the active provider. The API-size message was
appended there by `ensureCloudSafeText()` when `text.length > 20000`.

## Size limit and where enforced
The exact application-level limit was 20,000 characters of OCR/extracted text,
enforced in `GeminiEngine.ensureCloudSafeText()`. It is now removed as a hard
rejection for permitted non-sensitive documents; long text is handled with bounded
chunking in `GeminiEngine.extractDocumentFields()` using `chunkDocument()`.

## Files changed
- `lib/ai/GeminiEngine.ts`
- `tests/gemini-provider.test.ts`

## New behaviour
- Updated privacy refusal wording to remove Ollama references and state that no
  document content was sent to Google.
- `ensureCloudSafeText()` retains the restrictive sensitive-content guard.
- `extractDocumentFields()` chunks permitted long documents sequentially and
  aggregates results without replacing the structured report pipeline.

## Privacy-policy behaviour
Sensitive identity, land, court, FIR, medical, grievance and confidential business
content remains blocked by `ensureCloudSafeText()` before any Gemini request.

## Tests and build
- Lint passed
- Typecheck passed
- 255 tests passed
- Production build passed

## Remaining limitations
- Chunked extraction is applied to extraction; other stages retain their existing
  bounded prompt slicing.
- Chunk provenance beyond merged extraction is represented through existing
  source/page evidence, not new chunk IDs in the report.