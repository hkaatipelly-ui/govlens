"use client";

import type { OCRResult } from "../types/ocr-result";

interface Props {
  imageUrl: string | null;
  ocr: OCRResult | null;
  ocrProgress: number | null;
  ocrError: string | null;
  editableText: string;
  onTextChange: (text: string) => void;
}

export default function OCRViewer({
  imageUrl,
  ocr,
  ocrProgress,
  ocrError,
  editableText,
  onTextChange,
}: Props) {
  return (
    <section aria-label="Document and extracted text" className="gov-card p-4">
      <h2 className="gov-section-title !text-base">Captured Document</h2>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt="Captured government document"
          className="mt-3 max-h-64 w-full rounded-gov border border-gov-border bg-gov-offWhite object-contain"
        />
      )}

      {ocrProgress !== null && (
        <div className="mt-3" role="status" aria-live="polite">
          <p className="text-sm font-bold text-gov-navy">
            Reading document… {Math.round(ocrProgress * 100)}%
          </p>
          <div className="mt-1 h-2.5 overflow-hidden rounded-gov bg-gov-border">
            <div
              className="h-full bg-gov-blue transition-all"
              style={{ width: `${Math.round(ocrProgress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {ocrError && (
        <p role="alert" className="mt-3 rounded-gov border border-gov-red bg-red-50 p-3 text-sm font-semibold text-gov-red">
          OCR failed: {ocrError} You can retry or type the text manually below.
        </p>
      )}

      {ocr && !ocr.cleanedText && ocrProgress === null && (
        <p role="alert" className="mt-3 rounded-gov border border-gov-saffron bg-amber-50 p-3 text-sm text-amber-900">
          No text was detected. Try a clearer photo, or type the document text manually below.
        </p>
      )}

      <label htmlFor="ocr-text" className="mt-3 block text-sm font-bold text-gov-navy">
        Extracted Text {ocr && ocr.confidence > 0 && (
          <span className="font-normal text-gov-muted">
            (confidence {Math.round(ocr.confidence * 100)}% — correct it if needed)
          </span>
        )}
      </label>
      <textarea
        id="ocr-text"
        value={editableText}
        onChange={(e) => onTextChange(e.target.value)}
        rows={6}
        placeholder="Text from your document will appear here. You can also type it manually."
        className="gov-input mt-1"
      />
    </section>
  );
}
