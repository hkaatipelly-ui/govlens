/**
 * Deterministic post-pass over Gemma output (server-only).
 *
 * Copies values VERBATIM from the cleaned document text into slots the model
 * left null (reference numbers, dates/deadlines, amounts). This invents
 * nothing: every filled value is a substring of the document. It compensates
 * for model conservatism/nondeterminism, keeping the demo robust.
 */
import type { DocumentExtraction } from "./schemas";
import type { Explanation } from "../verification/schemas";

const REF_PATTERNS = [
  /(?:application|acknowledgement|receipt|reference|ack|app\.?|reg\.?|id|no\.?)\s*(?:number|num|id|no)?\s*[:\-]?\s*([A-Z]{2,10}[-/]?\d{4,12}[A-Z0-9-]*)/i,
  /\b([A-Z]{2,5}\d{6,12})\b/,
];

const AMOUNT_PATTERNS = [
  /(?:fee|amount|total|paid|charge|rs\.?)[^.]{0,40}?rs\.?\s?([\d,]+)/i,
  /\bRs\.?\s?([\d,]+)\b/,
];

const DEADLINE_PATTERNS = [
  /(collect[^.]{0,60}?after\s+\d+\s+days?)/i,
  /((?:within|after|in)\s+\d+\s+(?:days?|weeks?|months?))/i,
  /(last date[^.]{0,40}?\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
  /\b(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/,
];

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return (m[1] ?? m[0]).trim().slice(0, 120);
  }
  return null;
}

/** Fill null slots verbatim from the document. Returns the patched extraction. */
export function fillExtractionGaps(
  extraction: DocumentExtraction,
  documentText: string
): DocumentExtraction {
  const out = { ...extraction };
  if (!out.referenceNumber) {
    const ref = firstMatch(documentText, REF_PATTERNS);
    if (ref) out.referenceNumber = ref;
  }
  if (!out.amount) {
    const amount = firstMatch(documentText, AMOUNT_PATTERNS);
    if (amount) out.amount = amount.startsWith("Rs") ? amount : `Rs ${amount}`;
  }
  if (!out.deadline) {
    const deadline = firstMatch(documentText, DEADLINE_PATTERNS);
    if (deadline) out.deadline = deadline;
  }
  return out;
}

/** Guarantee a non-empty explanation from extraction when the model is terse. */
export function ensureExplanation(
  explanation: Explanation,
  extraction: DocumentExtraction,
  sourceIds: string[]
): Explanation {
  const out = { ...explanation, sourceIds };
  if (out.importantPoints.length === 0) {
    out.importantPoints = [
      ...extraction.requiredDocuments.slice(0, 3).map((d) => `Document needed: ${d}`),
      ...(extraction.referenceNumber ? [`Reference number: ${extraction.referenceNumber}`] : []),
      ...(extraction.deadline ? [`Deadline: ${extraction.deadline}`] : []),
    ].slice(0, 5);
  }
  if (out.whatToDo.length === 0) {
    out.whatToDo = extraction.requiredActions.slice(0, 5);
  }
  if (!out.deadline && extraction.deadline) out.deadline = extraction.deadline;
  if (!out.amount && extraction.amount) out.amount = extraction.amount;
  if (!out.verificationNote) {
    out.verificationNote =
      "Confirm the deadline, fee and document list at the department counter before acting.";
  }
  return out;
}
