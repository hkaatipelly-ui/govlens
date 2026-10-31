/**
 * Service directory → knowledge corpus (Phase 3, additive).
 *
 * Only records classified as `official` (a real official URL that responded
 * with HTTP 200 during a genuine review) are seeded into the knowledge engine,
 * so every excerpt that can be labelled "official" in answers actually has an
 * official, reviewed source behind it. `sample` and `secondary_unverified`
 * records stay in the service directory only and are never presented as
 * official knowledge.
 */
import { listServices } from "@/app/lib/service-directory";
import type { PublicService } from "@/app/types/service";
import type { RawSource } from "./chunker";

/** Builds the knowledge excerpt text for a service record (no guesses). */
function serviceText(service: PublicService): string {
  const parts: string[] = [
    `${service.title}.`,
    service.summary,
    service.description,
    `Who it helps: ${service.whoItHelps}.`,
    `Department: ${service.department}. Jurisdiction: ${service.jurisdiction}.`,
    `Steps: ${service.steps.join(". ")}.`,
  ];
  if (service.eligibility) parts.push(`Eligibility: ${service.eligibility.join("; ")}.`);
  if (service.requiredDocuments) {
    parts.push(`Required documents: ${service.requiredDocuments.join("; ")}.`);
  }
  if (service.feeInformation) parts.push(`Fees: ${service.feeInformation}`);
  if (service.deadlines) parts.push(`Deadlines: ${service.deadlines}`);
  parts.push(`Limitations: ${service.limitations}`);
  if (service.lastReviewed) {
    parts.push(
      `Source type: official government source, last reviewed ${service.lastReviewed}.`
    );
  }
  return parts.join(" ");
}

/** Maps one official service record to a knowledge source record. */
export function serviceToRawSource(service: PublicService): RawSource | null {
  if (service.sourceType !== "official") return null; // never seed unverified content
  if (!service.knowledgeSourceId || !service.officialUrl) return null;
  return {
    id: service.knowledgeSourceId,
    title: service.title,
    department: service.department,
    state: service.jurisdiction,
    type: "service-guide",
    sourceUrl: service.officialUrl,
    language: "en",
    publishedDate: "",
    effectiveDate: "",
    lastVerified: service.lastReviewed ?? "",
    text: serviceText(service),
  };
}

/** All service records eligible for the knowledge corpus. */
export function serviceDirectorySources(): RawSource[] {
  return listServices()
    .map(serviceToRawSource)
    .filter((s): s is RawSource => s !== null);
}
