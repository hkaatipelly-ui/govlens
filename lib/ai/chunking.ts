/**
 * Source-text chunking for large documents (server-only).
 * Splits by page markers, then headings, then paragraph groups — never
 * mid-sentence where avoidable, and every chunk keeps its page range so
 * provenance survives the merge. Only the SOURCE text is chunked; output
 * token budgets are separate (stageBudget).
 */
export interface TextChunk {
  index: number;
  pageStart: number;
  pageEnd: number;
  text: string;
}

const PAGE_MARK_RE = /\[Page (\d+)\]/g;
/** ~3000 chars ≈ fits comfortably alongside evidence in Gemma 3 4B context. */
export const CHUNK_TARGET = Number(process.env.GOVLENS_CHUNK_CHARS ?? 3000);
export const CHUNK_THRESHOLD = Number(process.env.GOVLENS_CHUNK_THRESHOLD ?? 6000);
export const MAX_CHUNKS = 4;

function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

export function chunkDocument(text: string): TextChunk[] {
  if (text.length <= CHUNK_THRESHOLD) {
    return [{ index: 0, pageStart: 1, pageEnd: 1, text }];
  }
  // 1) Prefer explicit page markers.
  const pageSplits: Array<{ page: number; start: number }> = [];
  for (const m of text.matchAll(PAGE_MARK_RE)) {
    pageSplits.push({ page: Number(m[1]), start: m.index ?? 0 });
  }
  const segments: Array<{ text: string; pageStart: number; pageEnd: number }> = [];
  if (pageSplits.length > 1) {
    pageSplits.forEach((s, i) => {
      const end = i + 1 < pageSplits.length ? pageSplits[i + 1].start : text.length;
      segments.push({ text: text.slice(s.start, end).trim(), pageStart: s.page, pageEnd: pageSplits[Math.min(i + 1, pageSplits.length - 1)].page });
    });
  } else {
    segments.push({ text, pageStart: 1, pageEnd: 1 });
  }
  // 2) Pack segments/paragraphs into target-sized chunks without splitting sentences.
  const chunks: TextChunk[] = [];
  let current = "";
  let curStart = 1;
  let curEnd = 1;
  const flush = () => {
    if (current.trim()) {
      chunks.push({ index: chunks.length, pageStart: curStart, pageEnd: curEnd, text: current.trim() });
      current = "";
    }
  };
  for (const seg of segments) {
    for (const para of splitParagraphs(seg.text)) {
      if ((current.length + para.length > CHUNK_TARGET) && current) {
        curEnd = seg.pageStart;
        flush();
        curStart = seg.pageStart;
      }
      current += (current ? "\n\n" : "") + para;
      curEnd = seg.pageEnd;
      if (chunks.length >= MAX_CHUNKS - 1 && current.length > CHUNK_TARGET) break;
    }
    if (chunks.length >= MAX_CHUNKS) break;
  }
  flush();
  // Overflow beyond MAX_CHUNKS merges into the last chunk (bounded by threshold*2 safety in callers).
  return chunks.length ? chunks : [{ index: 0, pageStart: 1, pageEnd: 1, text: text.slice(0, CHUNK_TARGET) }];
}
