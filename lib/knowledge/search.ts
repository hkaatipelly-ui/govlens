/** Keyword/phrase retrieval primitives (server-only). Embeddings can slot in later. */

export function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function tokenize(text: string): string[] {
  return normalize(text)
    .replace(/[^a-z\u0c00-\u0c7f\u0900-\u097f0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

export interface ScoredHit {
  id: string;
  score: number;
  matched: string[];
}

/**
 * Score one haystack against query tokens.
 * Title hits weigh 3x; long tokens weigh 2x. Phrase bonus for multi-word overlap.
 */
export function scoreText(
  queryTokens: string[],
  haystack: string,
  title: string
): { score: number; matched: string[] } {
  const hay = normalize(haystack);
  const titleNorm = normalize(title);
  const matched: string[] = [];
  let score = 0;
  for (const tok of queryTokens) {
    if (!hay.includes(tok)) continue;
    matched.push(tok);
    score += tok.length > 5 ? 2 : 1;
    if (titleNorm.includes(tok)) score += 3;
  }
  return { score, matched };
}
