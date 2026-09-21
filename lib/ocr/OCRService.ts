/** OCRService interface — OCR runs in the browser; the server accepts normalized text. */
export interface OCRResult {
  rawText: string;
  cleanedText: string;
  language: string;
  confidence: number;
}

export interface OCRService {
  recognize(
    image: Blob,
    languages?: string[],
    onProgress?: (progress: number) => void
  ): Promise<OCRResult>;
}

/** Shared text normalization (safe to use on server and client). */
export function cleanOcrText(raw: string): string {
  return raw
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
