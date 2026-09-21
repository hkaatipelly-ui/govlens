export interface OCRResult {
  rawText: string;
  cleanedText: string;
  language: string;
  confidence: number;
}
