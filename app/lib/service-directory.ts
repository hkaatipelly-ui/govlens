/**
 * Service directory data access + search (client and server safe).
 *
 * The single source of truth is app/data/services/service-directory.json —
 * every consumer (services page, detail page, knowledge seeder, tests) reads
 * through this module so search never runs against a second hardcoded array.
 */
import { z } from "zod";
import directoryJson from "@/app/data/services/service-directory.json";
import type { PublicService, ServiceCategory, ServiceSourceType } from "@/app/types/service";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PLACEHOLDER = /^(n\/a|na|tbd|tba|unknown|none|n\.a\.|todo|\?+|-+)$/i;

const CATEGORIES = [
  "certificates",
  "welfare",
  "ration",
  "agriculture",
  "education",
  "land",
  "courts",
  "municipal",
  "grievance",
  "utilities",
  "taxation",
  "transport",
] as const;

const SOURCE_TYPES = ["official", "secondary_unverified", "sample"] as const;

const optionalText = z
  .string()
  .trim()
  .min(1, "must not be empty when present")
  .refine((v) => !PLACEHOLDER.test(v), { message: "placeholder values are not allowed" })
  .optional();

const optionalTextList = z
  .array(z.string().trim().min(1))
  .min(1)
  .optional();

export const serviceSchema = z
  .object({
    id: z.string().trim().min(1),
    slug: z.string().trim().regex(SLUG, "must be a lower-kebab slug"),
    title: z.string().trim().min(1),
    aliases: z.array(z.string().trim().min(1)).default([]),
    category: z.enum(CATEGORIES),
    jurisdiction: z.string().trim().min(1),
    department: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    description: z.string().trim().min(1),
    whoItHelps: z.string().trim().min(1),
    steps: z
      .array(z.string().trim().min(1))
      .min(1, "at least one step is required")
      .refine((s) => s.every((x) => !PLACEHOLDER.test(x)), {
        message: "placeholder values are not allowed",
      }),
    eligibility: optionalTextList,
    requiredDocuments: optionalTextList,
    feeInformation: optionalText,
    deadlines: optionalText,
    officialUrl: z
      .string()
      .url("must be a valid URL")
      .regex(/^https:\/\//, "official links must be https")
      .nullable(),
    sourceType: z.enum(SOURCE_TYPES),
    lastReviewed: z
      .string()
      .regex(ISO_DATE, "must be an ISO date (YYYY-MM-DD)")
      .nullable(),
    limitations: z.string().trim().min(1),
    relatedServices: z.array(z.string().trim().regex(SLUG)),
    knowledgeSourceId: z.string().trim().min(1).optional(),
  })
  .superRefine((s, ctx) => {
    // Source-quality rules (Phase 3 rule C).
    if (s.sourceType === "official") {
      if (!s.officialUrl) {
        ctx.addIssue({
          code: "custom",
          path: ["officialUrl"],
          message: "official entries must have an official source link",
        });
      }
      if (!s.lastReviewed) {
        ctx.addIssue({
          code: "custom",
          path: ["lastReviewed"],
          message: "official entries must record a genuine review date",
        });
      }
    }
    if (s.sourceType === "sample") {
      if (!/sample record/i.test(s.limitations)) {
        ctx.addIssue({
          code: "custom",
          path: ["limitations"],
          message: "sample records must carry an explicit sample label",
        });
      }
      // Sample entries must not carry fees/deadlines/eligibility — they would
      // be guesses with no source behind them.
      if (s.feeInformation || s.deadlines || s.eligibility || s.requiredDocuments) {
        ctx.addIssue({
          code: "custom",
          path: ["limitations"],
          message: "sample records must not state fees, deadlines, eligibility or document lists",
        });
      }
    }
    if (s.sourceType === "secondary_unverified" && !/unconfirmed/i.test(s.limitations)) {
      ctx.addIssue({
        code: "custom",
        path: ["limitations"],
        message: "unverified sources must say they are unconfirmed",
      });
    }
    if (s.relatedServices.includes(s.slug)) {
      ctx.addIssue({
        code: "custom",
        path: ["relatedServices"],
        message: "a service cannot relate to itself",
      });
    }
  });

const directorySchema = z.array(serviceSchema).min(1);

/** Throws with a precise message when a record is empty or malformed. */
export function validateServiceRecord(input: unknown): PublicService {
  return serviceSchema.parse(input) as PublicService;
}

let cached: PublicService[] | null = null;

/**
 * Validates and returns the full directory. Malformed records throw instead of
 * rendering partial/incorrect information (empty and malformed records are
 * rejected safely).
 */
export function listServices(): PublicService[] {
  if (cached) return cached;
  const parsed = directorySchema.parse(directoryJson);
  const services = parsed as PublicService[];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const titles = new Set<string>();
  for (const s of services) {
    if (ids.has(s.id) || slugs.has(s.slug) || titles.has(s.title.toLowerCase())) {
      throw new Error(`Duplicate service record: ${s.slug}`);
    }
    ids.add(s.id);
    slugs.add(s.slug);
    titles.add(s.title.toLowerCase());
  }
  for (const s of services) {
    for (const rel of s.relatedServices) {
      if (!slugs.has(rel)) {
        throw new Error(`Service ${s.slug} relates to unknown service "${rel}"`);
      }
    }
  }
  cached = services;
  return services;
}

export function getServiceBySlug(slug: string): PublicService | undefined {
  return listServices().find((s) => s.slug === slug);
}

export function getRelatedServices(service: PublicService): PublicService[] {
  return service.relatedServices
    .map((slug) => getServiceBySlug(slug))
    .filter((s): s is PublicService => Boolean(s));
}

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  certificates: "Certificates & citizen documentation",
  welfare: "Welfare & pensions",
  ration: "Ration & food services",
  agriculture: "Agriculture & farmer support",
  education: "Education & student services",
  land: "Land records & property registration",
  courts: "Courts & case status",
  municipal: "Municipal services",
  grievance: "Public grievance services",
  utilities: "Electricity & water utilities",
  taxation: "Taxation",
  transport: "Transport & vehicles",
};

export function serviceCategories(
  services: PublicService[] = listServices()
): { id: ServiceCategory; label: string; count: number }[] {
  return CATEGORIES.map((id) => ({
    id,
    label: CATEGORY_LABELS[id],
    count: services.filter((s) => s.category === id).length,
  })).filter((c) => c.count > 0);
}

/** Words that carry no meaning for matching ordinary-language questions. */
const STOP_WORDS = new Set([
  "a", "an", "the", "i", "my", "me", "we", "to", "for", "of", "in", "on", "at",
  "is", "are", "do", "does", "did", "can", "could", "how", "what", "where",
  "when", "who", "why", "get", "apply", "need", "want", "and", "or", "with",
  "from", "by", "be", "have", "has", "it", "this", "that", "any", "you", "your",
]);

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9\u0C80-\u0CFF]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function haystack(s: PublicService): string {
  return [
    s.title,
    ...s.aliases,
    s.department,
    s.jurisdiction,
    s.summary,
    s.description,
    s.whoItHelps,
    CATEGORY_LABELS[s.category],
  ]
    .join(" ")
    .toLowerCase();
}

function aliasMatch(s: PublicService, token: string): boolean {
  return s.aliases.some((a) => a.toLowerCase().split(/\s+/).includes(token));
}

export interface ServiceQuery {
  query?: string;
  category?: ServiceCategory | "";
  /** Defaults to the loaded directory; the page passes its own validated list. */
  services?: PublicService[];
}

/**
 * Search over the current service data (title, aliases, ordinary phrases and
 * category). Every query token must match the record (after stop-word removal),
 * so natural questions like "how do I get a passport" resolve to the passport
 * service while nonsense returns an empty list.
 */
export function searchServices({
  query = "",
  category = "",
  services,
}: ServiceQuery = {}): PublicService[] {
  let results = services ?? listServices();
  if (category) results = results.filter((s) => s.category === category);

  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return results;

  const scored: { s: PublicService; score: number }[] = [];
  for (const s of results) {
    const text = haystack(s);
    const lowerTitle = s.title.toLowerCase();
    let score = 0;
    let matchedAll = true;
    for (const token of tokens) {
      if (lowerTitle.split(/\s+/).includes(token)) score += 3;
      else if (aliasMatch(s, token)) score += 2;
      else if (text.includes(token)) score += 1;
      else {
        matchedAll = false;
        break;
      }
    }
    if (matchedAll) scored.push({ s, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);
}
