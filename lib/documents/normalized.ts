/**
 * NormalizedDocument — ONE server-side representation for every input
 * (PDF, DOCX, JPEG, JPG, PNG, pasted text). Built from client-normalized
 * text/pages or raw text; never carries raw binary to the AI layer.
 */
export type NormalizedSourceType = "pdf" | "docx" | "jpeg" | "jpg" | "png" | "text";

export interface NormalizedBlock {
  text: string;
  pageNumber: number;
}

export interface NormalizedDocPage {
  pageNumber: number;
  text: string;
  ocrStatus: "text-layer" | "ocr" | "direct" | "unknown";
  imageAvailable: boolean;
  blocks: NormalizedBlock[];
}

export interface NormalizedDocument {
  documentId: string;
  ownerId: string;
  sessionId: string;
  caseId: string | null;
  sourceType: NormalizedSourceType;
  mimeType: string;
  fileName: string | null;
  pageCount: number;
  language: string;
  extractedText: string;
  pages: NormalizedDocPage[];
  tables: string[];
  images: string[];
  metadata: Record<string, string>;
  createdAt: string;
}

export interface BuildNormalizedInput {
  documentId?: string;
  ownerId: string;
  sessionId: string;
  sourceType: NormalizedSourceType;
  mimeType?: string;
  fileName?: string | null;
  language?: string;
  text: string;
  pages?: Array<{ pageNumber: number; text: string }>;
  hasImages?: boolean;
}

function splitBlocks(text: string, pageNumber: number): NormalizedBlock[] {
  return text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .slice(0, 200)
    .map((text) => ({ text: text.slice(0, 2000), pageNumber }));
}

export function buildNormalizedDocument(input: BuildNormalizedInput): NormalizedDocument {
  const rawPages =
    input.pages && input.pages.length
      ? input.pages
      : [{ pageNumber: 1, text: input.text }];
  const pages: NormalizedDocPage[] = rawPages.map((p) => ({
    pageNumber: p.pageNumber,
    text: p.text,
    ocrStatus: input.sourceType === "text" || input.sourceType === "docx" ? "direct" : "unknown",
    imageAvailable: !!input.hasImages,
    blocks: splitBlocks(p.text, p.pageNumber),
  }));
  return {
    documentId: input.documentId ?? `doc-${input.sessionId.slice(0, 8)}`,
    ownerId: input.ownerId,
    sessionId: input.sessionId,
    caseId: null,
    sourceType: input.sourceType,
    mimeType: input.mimeType ?? "text/plain",
    fileName: input.fileName ?? null,
    pageCount: pages.length,
    language: input.language ?? "en",
    extractedText: input.text,
    pages,
    tables: [],
    images: [],
    metadata: {},
    createdAt: new Date().toISOString(),
  };
}
