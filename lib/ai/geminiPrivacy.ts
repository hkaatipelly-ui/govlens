/**
 * Gemini privacy policy (server-only).
 *
 * The free Gemini API is a public hosted service. It may only receive narrow,
 * non-sensitive public-service content:
 *
 *   ALLOWED   — general public-service questions, curated public-source
 *               excerpts, non-sensitive FAQ answers, synthetic test examples.
 *   NOT ALLOWED — uploaded personal documents, OCR text of sensitive documents,
 *               private legal analysis, identity document contents, land/property
 *               records, FIR/court document content, grievance descriptions with
 *               private information, confidential staff notes, or any other
 *               user's document/case context.
 *
 * `screenPublicQuestion` is a best-effort detection of likely personal
 * identifiers and private-case content. It runs BEFORE any bytes leave the
 * server, both in the API route and (as a backstop) inside the Gemini engine.
 * When a question is rejected the content is never transmitted.
 */

export interface PrivacyVerdict {
  allowed: boolean;
  /** Safe, user-facing reason categories (never the matched content itself). */
  reasons: string[];
}

export const PUBLIC_QUESTION_HINT =
  "That question looks like it contains personal or private details (identity numbers, " +
  "case/FIR numbers, land, medical or document contents). Public-service questions must stay " +
  "non-sensitive. Please ask a general question instead, for example: “Which documents are " +
  "needed for an income certificate?”";

interface ScreenRule {
  reason: string;
  pattern: RegExp;
}

/** Patterns that look like personal identifiers or private record contents. */
const SCREEN_RULES: ScreenRule[] = [
  { reason: "Aadhaar-like identity number", pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/ },
  { reason: "PAN-like identity number", pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/ },
  { reason: "passport or voter-ID-like number", pattern: /\b[A-Z]\d{7}\b|\b[A-Z]{3}\d{7}\b/ },
  { reason: "email address", pattern: /\b[\w.+-]+@[\w-]+\.[\w-]{2,}\b/ },
  { reason: "personal mobile number", pattern: /(?:\+91[\s-]?)?\b[6-9]\d{9}\b/ },
  { reason: "IFSC or bank identifier", pattern: /\b[A-Z]{4}0[A-Z0-9]{6}\b|\bIFSC\b/i },
  { reason: "bank account number", pattern: /\b(?:account|a\/c|acct)[^\d]{0,20}\d{9,18}\b/i },
  { reason: "case or FIR number", pattern: /\b(?:fir|case|cnr)\s*(?:no\.?|number)\b|\bfirst information report\b/i },
  { reason: "your own FIR or case file", pattern: /\bmy\s+(?:fir|charge\s+sheet|case\s+file)\b/i },
  { reason: "personal legal situation", pattern: /\bi\s+(?:was|am|have\s+been)\s+(?:arrested|charged|detained|summoned|hospitalized)\b/i },
  { reason: "private land or property record", pattern: /\b(?:survey\s*(?:no|number)|pattadar|khata(?:book)?|land\s+record\s*(?:no|number)|record\s+of\s+rights)\b/i },
  { reason: "your own land or property record", pattern: /\bmy\s+(?:land|property|patta|plot|survey)\b/i },
  { reason: "medical or health information", pattern: /\b(?:hiv|pregnan\w*|cancer|psychiatr\w*|diagnos\w*|prescription|mental\s+health|medical\s+record)\b/i },
  { reason: "identity document contents", pattern: /\bmy\s+(?:aadhaar|passport|voter\s+id|pan\s+card|driving\s+licen[cs]e)\b/i },
  { reason: "private financial or employment records", pattern: /\bmy\s+(?:salary|bank\s+account|itr|tax\s+return|payslip|offer\s+letter)\b/i },
  // Phase 4 (G): grievance descriptions and staff notes.
  { reason: "grievance description", pattern: /\b(?:my|the|this)\s+grievance\s+(?:about|against|regarding|since|from|details|description|states)\b/i },
  { reason: "grievance or complaint details", pattern: /\b(?:grievance|complaint)\s+(?:details|description|text|narrative|note)\b/i },
  { reason: "staff notes or remarks", pattern: /\bstaff\s+(?:notes?|comments?|remarks?)\b/i },
  // Phase 4 (G): detailed legal narratives.
  { reason: "detailed legal narrative", pattern: /\b(?:my|the)\s+(?:charge\s+sheet|legal\s+notice|show\s+cause\s+notice|writ\s+petition|fir\s+copy)\b/i },
  { reason: "detailed legal narrative", pattern: /\b(?:charge\s+sheet|legal\s+notice|fir)\s+(?:says|states|mentions|alleges|against\s+me)\b/i },
  // Phase 4 (G): specific personal property ownership disputes.
  { reason: "property ownership dispute", pattern: /\b(?:ownership|title)\s+(?:dispute|conflict|claim)\s+(?:over|for|on|between)\b/i },
  { reason: "property ownership dispute", pattern: /\bdispute\s+(?:over|about)\s+(?:my|the)\s+(?:land|plot|property|house)\b/i },
  { reason: "property ownership dispute", pattern: /\bi\s+(?:own|claim|dispute)\s+(?:the|this|my)\s+(?:land|plot|property|house)\b/i },
  // Phase 4 (G): payment instrument details.
  { reason: "payment card details", pattern: /\b(?:credit|debit|atm|rupay|visa|mastercard)\s*card\s*(?:number|no\.?)?\b|\bcvv\b/i },
  { reason: "UPI/VPA payment identifier", pattern: /\b[a-z0-9._-]+@(?:okaxis|okicici|okhdfc|okhdfcbank|ybl|ibl|axl|upi)\b/i },
];

/**
 * Decide whether a question may be sent to a hosted provider.
 * Deterministic and side-effect free (unit-testable).
 */
export function screenPublicQuestion(question: string): PrivacyVerdict {
  const text = question ?? "";
  const reasons = SCREEN_RULES.filter((rule) => rule.pattern.test(text)).map(
    (rule) => rule.reason
  );
  return { allowed: reasons.length === 0, reasons: Array.from(new Set(reasons)) };
}


export interface CloudDocumentVerdict {
  allowed: boolean;
  reasons: string[];
}

/**
 * Conservative check for whether OCR/document text may be sent to the unpaid
 * Gemini API. Defaults to refusal when the content looks like a sensitive or
 * unclassifiable record.
 */
export function isSensitiveDocument(text: string): boolean {
  const t = text ?? "";
  return /\b(?:aadhaar|pan card|passport|fir|first information report|charge sheet|medical(?:\s+\w+)?\s+certificate|medical record|health certificate|diagnosis|prescription|bank account|ifsc|identity document|land record|property record|property ownership|court order|writ|legal notice|private|confidential)\b/i.test(
    t
  );
}

export function screenCloudDocument(text: string): CloudDocumentVerdict {
  const reasons: string[] = [];
  const base = screenPublicQuestion(text);
  if (!base.allowed) reasons.push(...base.reasons);
  if (/\b(?:fir|first information report|charge sheet|medical(?:\s+\w+)?\s+certificate|medical record|health certificate|diagnosis|prescription|bank account|ifsc|aadhaar|pan card|passport|property deed|land record|patta|court order|writ|legal notice)\b/i.test(text)) {
    reasons.push("sensitive document content");
  }
  if (text.trim().length < 20) reasons.push("insufficient text to classify safely");
  const unique = [...new Set(reasons)];
  return { allowed: unique.length === 0, reasons: unique };
}
