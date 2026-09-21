import type { OCRResult } from "../types/ocr-result";

export interface OCRService {
  /** Recognize text from an image blob. `languages` like ["eng", "tel"]. */
  recognize(
    image: Blob,
    languages?: string[],
    onProgress?: (progress: number) => void
  ): Promise<OCRResult>;
}

function cleanText(raw: string): string {
  return raw
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Browser implementation backed by Tesseract.js (lazy import keeps it client-only). */
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
        cleanedText: cleanText(rawText),
        language: rawText ? "mixed" : "unknown",
        confidence: typeof data?.confidence === "number" ? data.confidence / 100 : 0,
      };
    } finally {
      await worker.terminate();
    }
  }
}

let singleton: OCRService | null = null;

/** Client-side singleton. Server routes never import tesseract; OCR runs in the browser. */
export function getOCRService(): OCRService {
  if (typeof window === "undefined") {
    throw new Error("OCRService is browser-only. Run OCR on the client, then POST text to /api/analyze.");
  }
  if (!singleton) singleton = new TesseractOCRService();
  return singleton;
}
