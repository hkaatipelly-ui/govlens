# Document scanning performance report — GovLens

## Original architecture
- Frontend `app/scan/page.tsx` performs OCR/ingestion, then streams `/api/analyze`.
- `normalizePdf()` extracted text and, if whole-document text was <50 chars, OCR'd every page even when only some pages were unreadable.
- Backend `app/api/analyze/route.ts` rebuilt the normalized document four times (foundation, deep, scheme, legal).

## Identified bottlenecks
- Whole-document OCR policy was all-or-nothing, not page-aware.
- OCR of partially readable PDFs repeated/completely duplicated text extraction.
- Backend repeatedly reconstructed identical normalized document data.
- Gemini live requests can encounter transient HTTP 503 before success.

## Changes made
- `app/lib/ingestion.ts`: page-aware PDF extraction. Embedded text is reused for pages with sufficient text; OCR runs only for pages below a conservative threshold.
- Limited OCR concurrency to 2 to avoid browser memory/CPU overload.
- Preserved page numbers, ordering, and provenance.
- `app/api/analyze/route.ts`: compute the normalized document once and reuse it in all downstream deterministic stages.

## Preserved
- OCR languages English/Telugu.
- Evidence verification and document classification.
- Privacy and explicit cloud consent.
- Gemini as sole AI provider.
- 540000 ms Gemini timeout.

## Benchmark status
- No synthetic/new real-world before-vs-after scan benchmark was fabricated.
- Observed real Gemini live integration test: two HTTP 503s followed by one success, approximately 90.6 seconds.
- Expected improvement: fewer OCR operations on mixed/selectable PDFs and less repeated backend normalization. OCR on fully scanned PDFs still requires per-page OCR.
- No silent page skipping; unreadable full-document extraction still throws `no-text`.

## Checks
- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm test`: 255 passed
- `npm run build`: passed

## Remaining bottlenecks
- Live Gemini latency and transient HTTP 503 behavior depend on Google service availability.
- Fully scanned PDFs still require page OCR.
- Deeper Gemini request consolidation may require SDK/API validation and accuracy benchmarks before safe implementation.