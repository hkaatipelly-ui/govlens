# Gemini document-scan integration audit

## 1. Previous Ollama-only restriction

The document scanner originally called `POST /api/analyze`, and `app/api/analyze/route.ts` resolved the AI engine with:

```ts
engine = requireOwnerLocalAI(isOwner());
```

That function (`lib/ai/providerPolicy.ts`) returns only the Ollama engine. Gemini was never injected into the document-analysis pipeline; Gemini supported only public-service Q&A in `lib/qa/publicServiceQa.ts`. `GeminiEngine` itself implemented all document-bound AI methods as privacy refusals.

## 2. Root cause

The owner-only Ollama resolution was hard-coded in the analyze route. No `provider` was accepted or validated, the request schema did not allow a choice, the scan UI only called the local path, and Gemini document methods always threw a privacy refusal. As a result, even with a valid `GEMINI_API_KEY` and `GEMINI_ENABLED=true`, an owner selecting any AI operation in the scan flow always used Ollama.

## 3. Exact files changed

- `lib/ai/GeminiEngine.ts`: implemented document-bound methods (`analyzeDocument`, `analyzeDeep`, `cleanupOcrText`, `verifyGovernmentDocument`, `extractDocumentFields`, `explainDocument`, `generateActionPlan`, `translate`) through the existing Gemini transport; added conservative cloud-document guard.
- `lib/validation/apiSchemas.ts`: extended `analyzeRequestSchema` with validated `provider` (`ollama` or `gemini`) and `cloudConsent`.
- `app/api/analyze/route.ts`: added owner-gated provider selection, server-side allowlist and configuration checks, consent check, sensitivity routing to local Ollama for unsuitable/sensitive documents, and recorded provider in the streamed result.
- `lib/ai/geminiPrivacy.ts`: added `screenCloudDocument()` for document text.
- `app/services/api.ts`: extended `apiAnalyze()` with `provider` and `cloudConsent`.
- `app/scan/page.tsx`: added owner-only provider selector and explicit cloud-transmission consent checkbox while retaining existing scanner layout.
- `tests/owner-ai-policy.test.ts`: updated provider-stripping test to reflect the new explicit `analyzeRequestSchema.provider` allowlist.
- `tests/gemini-provider.test.ts`: updated cloud-privacy coverage to use sensitive document inputs after Gemini document methods became available for non-sensitive documents.
- `docs/GEMINI_DOCUMENT_SCAN_INTEGRATION.md`: this report.

## 4. Provider selection

The scan page shows the selector only when `apiOwnerStatus()` confirms the owner session. Non-owners never see it and still receive `OWNER_REQUIRED` from the server. Selecting `ollama` uses `requireOwnerLocalAI(true)`; selecting `gemini` requires:

1. Authenticated owner
2. `GEMINI_ENABLED=true`
3. Non-empty `GEMINI_API_KEY`
4. Explicit `cloudConsent=true`

If a document is sensitive or cannot be safely classified, the route defaults it to local Ollama and does not send it to Gemini. If Ollama is unavailable for a rejected sensitive document, the route fails with a clear error rather than uploading to Gemini.

## 5. Document types and provider routing

Gemini is now used only for non-sensitive document text after owner consent. Documents containing indicators such as private, confidential, Aadhaar, PAN, passport, FIR, court, legal notice, medical, land/property record, identity, or payment details are treated as requiring local Ollama. Very short or insufficient text also defaults to local-only handling.

## 6. Test results

- `npm run lint`: pass (with existing React hook info warnings)
- `npm run typecheck`: pass
- `npm test`: 250 passed
- `npm run build`: passed

No live Gemini request was performed during this task.

## 7. Remaining limitations

- Gemini document methods implement the existing AI pipeline through direct structured generation, but they do not independently implement Ollama-style document chunking; very large documents are bounded by the current ~4000 character prompt slices.
- Cloud analysis is owner-only and gated behind consent; it is not a public path.
- Sensitive or unclassifiable documents should use local Ollama; if local Ollama is unavailable, no cloud fallback is attempted.
PY