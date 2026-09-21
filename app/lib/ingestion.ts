"use client";

/**
 * Document ingestion — accepts PDF / DOCX / JPEG / JPG / PNG and normalizes
 * every format into ONE representation that enters the existing GovLens
 * pipeline (OCR text → verification → RAG → Gemma). No separate AI pipelines.
 *
 * - Images: existing Tesseract OCR path (unchanged behavior).
 * - Text PDFs: direct text-layer extraction via pdf.js.
 * - Scanned PDFs: pages rendered to images → existing OCR.
 * - DOCX: direct text extraction via mammoth (no OCR needed).
 */
import { randomUUID } from "./id";
import type { OCRService } from "./ocr-service";

export type SupportedFileType = "pdf" | "docx" | "jpeg" | "jpg" | "png";

export interface NormalizedPage {
  pageNumber: number;
  text: string;
}

export interface NormalizedDocument {
  id: string;
  fileName: string;
  fileType: SupportedFileType;
  mimeType: string;
  text: string;
  pages: NormalizedPage[];
  originalSize: number;
  language: string;
  /** Downscaled first-page/document image for Gemma vision (optional). */
  firstPageImageDataUrl: string | null;
}

export type IngestionErrorCode =
  | "unsupported-type"
  | "oversized"
  | "empty-docx"
  | "unreadable-pdf"
  | "corrupt-pdf"
  | "protected-pdf"
  | "no-text"
  | "ocr-failed"
  | "docx-failed";

export class IngestionError extends Error {
  code: IngestionErrorCode;
  constructor(code: IngestionErrorCode, message: string) {
    super(message);
    this.name = "IngestionError";
    this.code = code;
  }
}

/** Prototype stability limit (new; previously no explicit limit existed). */
export const MAX_FILE_SIZE = 15 * 1024 * 1024;

const EXT_TO_TYPE: Record<string, SupportedFileType> = {
  pdf: "pdf",
  docx: "docx",
  jpeg: "jpeg",
  jpg: "jpg",
  png: "png",
};

export const SUPPORTED_LABEL = "Supported: PDF, DOCX, JPG, JPEG, PNG";

/** Validate extension AND mime (browsers misreport MIME, so extension decides). */
export function validateFile(file: File): SupportedFileType {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const kind = EXT_TO_TYPE[ext];
  if (!kind) {
    throw new IngestionError(
      "unsupported-type",
      "Unsupported file type. Please upload PDF, DOCX, JPG, JPEG or PNG."
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new IngestionError(
      "oversized",
      `File is too large (${Math.round(file.size / 1024 / 1024)} MB). Please use a file under 15 MB.`
    );
  }
  if (file.size === 0) {
    throw new IngestionError("no-text", "This file is empty.");
  }
  return kind;
}

export function sanitizeFileName(name: string): string {
  return name
    .split(/[/\\]/)
    .pop()!
    .replace(/[^\w.\-() ]/g, "_")
    .slice(0, 120);
}

export interface IngestOptions {
  onProgress?: (fraction: number, label: string) => void;
  maxPages?: number;
}

async function pdfLib() {
  const pdfjs = require("pdfjs-dist/legacy/build/pdf.js") as typeof import("pdfjs-dist/legacy/build/pdf");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
  }
  return pdfjs;
}

async function renderPageToDataUrl(
  page: any,
  scale: number
): Promise<string> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.7);
}

async function normalizePdf(
  file: File,
  ocr: OCRService,
  opts: IngestOptions
): Promise<Pick<NormalizedDocument, "text" | "pages" | "firstPageImageDataUrl">> {
  const onProgress = opts.onProgress ?? (() => {});
  let pdf: { numPages: number; getPage(n: number): Promise<never> } | null = null;
  try {
    const lib = await pdfLib();
    const data = new Uint8Array(await file.arrayBuffer());
    const task = lib.getDocument({ data, isEvalSupported: false, useSystemFonts: true });
    pdf = (await task.promise) as any;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/password|encrypted/i.test(msg)) {
      throw new IngestionError("protected-pdf", "This PDF is password-protected and cannot be read.");
    }
    throw new IngestionError("corrupt-pdf", "Could not read this PDF. The file may be corrupt.");
  }
  if (!pdf || pdf.numPages < 1) {
    throw new IngestionError("unreadable-pdf", "Could not extract readable text from this document.");
  }

  const maxPages = Math.min(opts.maxPages ?? 10, pdf.numPages);
  const pages: NormalizedPage[] = [];
  // 1) Try the embedded text layer first.
  for (let n = 1; n <= maxPages; n++) {
    try {
      const page = (await pdf.getPage(n)) as any;
      const content = await page.getTextContent();
      const strings = (content.items as Array<{ str?: string }>).map((it) => it.str ?? "");
      pages.push({ pageNumber: n, text: strings.join(" ").replace(/\s+/g, " ").trim() });
    } catch {
      pages.push({ pageNumber: n, text: "" });
    }
    onProgress(n / maxPages / 2, `Reading PDF page ${n}/${maxPages}`);
  }

  let combined = pages
    .map((p) => (p.text ? `[Page ${p.pageNumber}]\n${p.text}` : ""))
    .filter(Boolean)
    .join("\n\n");

  // 2) Scanned PDF: little/no text → render pages → existing OCR.
  let firstPageImageDataUrl: string | null = null;
  if (combined.replace(/\[Page \d+\]/g, "").trim().length < 50) {
    const scanned: NormalizedPage[] = [];
    for (let n = 1; n <= maxPages; n++) {
      try {
        const page = (await pdf.getPage(n)) as any;
        const dataUrl = await renderPageToDataUrl(page, 2.0);
        if (n === 1) firstPageImageDataUrl = dataUrl;
        const blob = await (await fetch(dataUrl)).blob();
        const result = await ocr.recognize(blob, ["eng", "tel"]);
        scanned.push({ pageNumber: n, text: result.cleanedText });
      } catch (err) {
        if (err instanceof IngestionError) throw err;
        throw new IngestionError("ocr-failed", "Could not read this scanned PDF (OCR failed).");
      }
      onProgress(0.5 + (n / maxPages / 2), `Reading scanned page ${n}/${maxPages}`);
    }
    combined = scanned
      .map((p) => (p.text ? `[Page ${p.pageNumber}]\n${p.text}` : ""))
      .filter(Boolean)
      .join("\n\n");
    if (!combined.trim()) {
      throw new IngestionError(
        "no-text",
        "Could not extract readable text from this document. Try a clearer scan."
      );
    }
    return { text: combined, pages: scanned, firstPageImageDataUrl };
  }

  // Text PDF: still render page 1 (small) for the vision path.
  try {
    const first = (await pdf.getPage(1)) as any;
    firstPageImageDataUrl = await renderPageToDataUrl(first, 1.0);
  } catch {
    /* vision image is optional */
  }
  return { text: combined, pages, firstPageImageDataUrl };
}

async function normalizeDocx(file: File): Promise<Pick<NormalizedDocument, "text" | "pages">> {
  let raw: string;
  try {
    const mammoth = await import("mammoth");
    const buffer = await file.arrayBuffer();
    const out = await mammoth.extractRawText({ arrayBuffer: buffer });
    raw = (out.value ?? "").replace(/\r/g, "").trim();
  } catch {
    throw new IngestionError("docx-failed", "Could not read this DOCX file. It may be corrupt.");
  }
  if (!raw) {
    throw new IngestionError("empty-docx", "This DOCX appears to be empty.");
  }
  return { text: raw, pages: [{ pageNumber: 1, text: raw }] };
}

/**
 * Normalize any supported file into the single downstream representation.
 * Images are NOT handled here — they keep the existing camera/OCR path.
 */
export async function normalizeDocumentFile(
  file: File,
  ocr: OCRService,
  opts: IngestOptions = {}
): Promise<NormalizedDocument> {
  const fileType = validateFile(file);
  if (fileType === "pdf") {
    const { text, pages, firstPageImageDataUrl } = await normalizePdf(file, ocr, opts);
    return {
      id: randomUUID(),
      fileName: sanitizeFileName(file.name),
      fileType,
      mimeType: file.type || "application/pdf",
      text,
      pages,
      originalSize: file.size,
      language: "mixed",
      firstPageImageDataUrl,
    };
  }
  const { text, pages } = await normalizeDocx(file);
  return {
    id: randomUUID(),
    fileName: sanitizeFileName(file.name),
    fileType,
    mimeType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    text,
    pages,
    originalSize: file.size,
    language: "mixed",
    firstPageImageDataUrl: null,
  };
}
