"use client";

/**
 * TesseractOCRService — browser-only Tesseract.js implementation.
 * This module must never be imported by server code (it pulls tesseract.js).
 */
import { cleanOcrText, type OCRResult, type OCRService } from "./OCRService";

export type { OCRResult, OCRService };
export { cleanOcrText };

export class TesseractOCRService implements OCRService {
  async recognize(
    image: Blob,
    languages: string[] = ["eng", "tel"],
    onProgress?: (progress: number) => void
  ): Promise<OCRResult> {
    const { createWorker } = await import("tesseract.js");
    const langs = Array.from(new Set(languages)).join("+");
    const worker = await createWorker(langs || "eng", undefined, {
      logger: (m: { status?: string; progress?: number }) => {
        if (typeof m?.progress === "number") onProgress?.(m.progress);
      },
    });
    try {
      const { data } = await worker.recognize(image);
      const rawText = (data?.text ?? "").trim();
      return {
        rawText,
        cleanedText: cleanOcrText(rawText),
        language: rawText ? "mixed" : "unknown",
        confidence: typeof data?.confidence === "number" ? data.confidence / 100 : 0,
      };
    } finally {
      await worker.terminate();
    }
  }
}

let singleton: OCRService | null = null;

export function getOCRService(): OCRService {
  if (typeof window === "undefined") {
    throw new Error(
      "OCRService is browser-only. Run OCR on the client, then POST text to /api/analyze."
    );
  }
  if (!singleton) singleton = new TesseractOCRService();
  return singleton;
}
