/**
 * Public-service directory record model (Phase 3).
 *
 * Source-quality classification (see docs/GOVLENS_PUBLIC_GRIEVANCE_GAP_ANALYSIS.md §E and
 * Phase 3 rule C):
 *  - "official"             : an official government URL that returned HTTP 200 with
 *                             matching content during a real review on `lastReviewed`.
 *  - "secondary_unverified" : official-domain source carried over from existing records
 *                             whose content could NOT be confirmed during our review
 *                             (dead deep link, timeout, TLS error). The limitation is
 *                             recorded on the record itself.
 *  - "sample"               : clearly identified GovLens sample entry with no confirmed
 *                             official source. Never presented as government advice.
 *
 * Optional fields (eligibility, requiredDocuments, feeInformation, deadlines) are left
 * undefined when the source does not state them — they are never guessed.
 */

export type ServiceSourceType = "official" | "secondary_unverified" | "sample";

export type ServiceCategory =
  | "certificates"
  | "welfare"
  | "ration"
  | "agriculture"
  | "education"
  | "land"
  | "courts"
  | "municipal"
  | "grievance"
  | "utilities"
  | "taxation"
  | "transport";

export interface PublicService {
  id: string;
  slug: string;
  title: string;
  aliases: string[];
  category: ServiceCategory;
  /** Geographic scope: "Telangana", "Government of India", etc. */
  jurisdiction: string;
  department: string;
  summary: string;
  description: string;
  whoItHelps: string;
  steps: string[];
  eligibility?: string[];
  requiredDocuments?: string[];
  feeInformation?: string;
  deadlines?: string;
  /** Verified link shown in the directory; null when no official link was confirmed. */
  officialUrl: string | null;
  sourceType: ServiceSourceType;
  /** ISO date (YYYY-MM-DD) of a genuine review, or null when never reviewed. */
  lastReviewed: string | null;
  limitations: string;
  /** Slugs of related service records (all must resolve to other records). */
  relatedServices: string[];
  /**
   * Knowledge-base source id this service is grounded by, when one exists.
   * Reused records point at the pre-existing document source id; new official
   * records use "svc-<slug>". Omitted for records not seeded into the KB.
   */
  knowledgeSourceId?: string;
}

/** How a record's review state should be displayed — never invents a date. */
export function sourceReviewLabel(service: Pick<PublicService, "lastReviewed">): string {
  return service.lastReviewed ? `Reviewed ${service.lastReviewed}` : "Not yet reviewed";
}

/** Badge variant used by StatusBadge for each source classification. */
export function sourceBadge(
  sourceType: ServiceSourceType
): { status: string; label: string } {
  switch (sourceType) {
    case "official":
      return { status: "verified", label: "Official source" };
    case "secondary_unverified":
      return { status: "unverified", label: "Source not confirmed" };
    case "sample":
      return { status: "other", label: "Sample record" };
  }
}
