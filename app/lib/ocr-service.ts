"use client";

/** Frontend entry-point for OCR. Canonical implementation: lib/ocr/TesseractOCRService. */
export {
  getOCRService,
  TesseractOCRService,
  cleanOcrText,
  type OCRResult,
  type OCRService,
} from "@/lib/ocr/TesseractOCRService";
