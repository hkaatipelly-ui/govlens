/** Text chunking for the local knowledge corpus (server-only, no embeddings). */
import { newId } from "../db/database";

export interface RawSource {
  id: string;
  title: string;
  department: string;
  state: string;
  type: string;
  sourceUrl: string;
  language: string;
  publishedDate: string;
  effectiveDate: string;
  lastVerified: string;
  text: string;
}

export interface ChunkRecord {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  keywords: string[];
}

const MAX_CHUNK = 700;

export function splitContent(text: string): string[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if ((current + " " + s).trim().length > MAX_CHUNK && current) {
      chunks.push(current.trim());
      current = s;
    } else {
      current = (current + " " + s).trim();
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text.trim()].filter(Boolean);
}

export function chunkSource(source: RawSource): ChunkRecord[] {
  return splitContent(source.text).map((content, chunkIndex) => ({
    id: `${source.id}#${chunkIndex}`,
    documentId: source.id,
    chunkIndex,
    content,
    keywords: extractKeywords(`${source.title} ${content}`),
  }));
}

export function extractKeywords(text: string): string[] {
  const stop = new Set([
    "the", "and", "for", "with", "from", "that", "this", "are", "was",
    "will", "can", "has", "have", "after", "before", "such", "into",
  ]);
  const out = new Set<string>();
  for (const tok of text.toLowerCase().replace(/[^a-z\u0c00-\u0c7f\u0900-\u097f\s-]/g, " ").split(/\s+/)) {
    if (tok.length > 2 && !stop.has(tok)) out.add(tok);
  }
  return [...out].slice(0, 40);
}

export { newId };
