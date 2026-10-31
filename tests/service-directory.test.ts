import { describe, it, expect } from "vitest";
import {
  getRelatedServices,
  getServiceBySlug,
  listServices,
  searchServices,
  serviceCategories,
  validateServiceRecord,
} from "@/app/lib/service-directory";
import { sourceBadge, sourceReviewLabel } from "@/app/types/service";
import type { PublicService } from "@/app/types/service";
import { openTestDatabase } from "@/lib/db/database";
import { migrate } from "@/lib/db/migrations";
import { LocalKnowledgeEngine } from "@/lib/knowledge/LocalKnowledgeEngine";
import { serviceDirectorySources } from "@/lib/knowledge/serviceSources";
import { SourceService } from "@/lib/sources/SourceService";

const TODAY = "2026-10-27";

/* ------------------------------------------------------------------ F1-F2 */

describe("F1: at least 15 distinct, non-duplicate service records", () => {
  const services = listServices();

  it("has at least 15 valid service records", () => {
    expect(services.length).toBeGreaterThanOrEqual(15);
  });

  it("has unique ids, slugs and titles", () => {
    const ids = new Set(services.map((s) => s.id));
    const slugs = new Set(services.map((s) => s.slug));
    const titles = new Set(services.map((s) => s.title.toLowerCase()));
    expect(ids.size).toBe(services.length);
    expect(slugs.size).toBe(services.length);
    expect(titles.size).toBe(services.length);
  });

  it("every entry has a title and a category", () => {
    for (const s of services) {
      expect(s.title.trim().length).toBeGreaterThan(0);
      expect(s.category.trim().length).toBeGreaterThan(0);
      expect(serviceCategories().some((c) => c.id === s.category)).toBe(true);
    }
  });

  it("every related service link resolves to a real record", () => {
    for (const s of services) {
      expect(getRelatedServices(s).length).toBe(s.relatedServices.length);
    }
  });

  it("covers the Telangana + central geographic scope explicitly", () => {
    const scopes = new Set(services.map((s) => s.jurisdiction));
    expect([...scopes].some((j) => j.includes("Telangana"))).toBe(true);
    expect([...scopes].some((j) => j.includes("Government of India"))).toBe(true);
  });
});

/* -------------------------------------------------------------------- F3 */

describe("F3: official entries carry an official source link", () => {
  it("every official record has an https official URL", () => {
    for (const s of listServices().filter((x) => x.sourceType === "official")) {
      expect(s.officialUrl).toBeTruthy();
      expect(s.officialUrl).toMatch(/^https:\/\//);
      expect(s.officialUrl).not.toMatch(/example\.com|localhost|lorem/i);
    }
  });

  it("official entries are backed by reviewed official knowledge sources", () => {
    const official = serviceDirectorySources();
    expect(official.length).toBeGreaterThanOrEqual(15);
    for (const src of official) {
      expect(src.sourceUrl).toMatch(/^https:\/\//);
      expect(src.lastVerified).toBe(TODAY); // genuine review date recorded today
    }
  });
});

/* -------------------------------------------------------------------- F4 */

describe("F4: sample records are labelled as sample", () => {
  const samples = listServices().filter((s) => s.sourceType === "sample");

  it("exists and each carries an explicit sample label", () => {
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) {
      expect(s.limitations).toMatch(/sample record/i);
      expect(s.description).toMatch(/sample record/i);
      expect(sourceBadge(s.sourceType).label).toBe("Sample record");
    }
  });

  it("sample records never enter the knowledge corpus", () => {
    for (const src of serviceDirectorySources()) {
      expect(src.id).not.toMatch(/^svc-electricity|^svc-water|^svc-social/);
    }
    const sampleKbIds = samples.map((s) => s.knowledgeSourceId).filter(Boolean);
    expect(sampleKbIds).toEqual([]);
  });
});

/* -------------------------------------------------------------------- F5 */

describe("F5: unreviewed sources are not presented as recently verified", () => {
  it("records without a review date say 'Not yet reviewed'", () => {
    const unreviewed = listServices().filter((s) => s.lastReviewed === null);
    expect(unreviewed.length).toBeGreaterThan(0);
    for (const s of unreviewed) {
      expect(sourceReviewLabel(s)).toBe("Not yet reviewed");
      expect(sourceReviewLabel(s)).not.toMatch(/\d{4}/);
    }
  });

  it("only official records carry a review date, and it is a real ISO date not in the future", () => {
    for (const s of listServices()) {
      if (s.lastReviewed !== null) {
        expect(s.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(s.lastReviewed <= TODAY).toBe(true);
      }
      if (s.sourceType === "sample") expect(s.lastReviewed).toBeNull();
    }
  });

  it("review labels derive from the stored date only", () => {
    expect(sourceReviewLabel({ lastReviewed: "2026-10-27" })).toBe("Reviewed 2026-10-27");
  });
});

/* -------------------------------------------------------------------- F6 */

describe("F6: search and filtering run against the current service data", () => {
  it("finds a service by title", () => {
    const r = searchServices({ query: "passport" });
    expect(r[0]?.slug).toBe("passport-application");
  });

  it("finds a service by alias", () => {
    const r = searchServices({ query: "ration card" });
    expect(r.some((s) => s.slug === "food-security-ration-card")).toBe(true);
    expect(searchServices({ query: "white ration card" }).some((s) => s.slug === "food-security-ration-card")).toBe(true);
  });

  it("finds a service from an ordinary-language question", () => {
    const r = searchServices({ query: "how do I get a passport" });
    expect(r.some((s) => s.slug === "passport-application")).toBe(true);
    const r2 = searchServices({ query: "where do I pay house tax" });
    expect(r2.some((s) => s.slug === "property-tax")).toBe(true);
  });

  it("filters by category", () => {
    const r = searchServices({ category: "education" });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((s) => s.category === "education")).toBe(true);
  });

  it("combines category filter with query", () => {
    const r = searchServices({ query: "scholarship", category: "education" });
    expect(r.every((s) => s.category === "education")).toBe(true);
    expect(r.some((s) => s.slug === "national-scholarship")).toBe(true);
  });

  it("returns an empty list for no-match queries", () => {
    expect(searchServices({ query: "xyzzy nonsense qqq" })).toEqual([]);
  });

  it("returns the full directory for an empty/stop-word-only query", () => {
    expect(searchServices({})).toHaveLength(listServices().length);
    expect(searchServices({ query: "the how do I" })).toHaveLength(listServices().length);
  });

  it("search results are records from the loaded directory (no second array)", () => {
    const ids = new Set(listServices().map((s) => s.id));
    for (const s of searchServices({ query: "tax" })) expect(ids.has(s.id)).toBe(true);
  });
});

/* -------------------------------------------------------------------- F7 */

describe("F7: detail lookups resolve the correct service", () => {
  it("every slug resolves to exactly the matching record", () => {
    for (const s of listServices()) {
      const found = getServiceBySlug(s.slug);
      expect(found).toBeDefined();
      expect(found!.id).toBe(s.id);
      expect(found!.title).toBe(s.title);
      expect(found!.knowledgeSourceId).toBe(s.knowledgeSourceId);
    }
  });

  it("unknown slugs resolve to undefined (page renders not-found)", () => {
    expect(getServiceBySlug("does-not-exist")).toBeUndefined();
    expect(getServiceBySlug("")).toBeUndefined();
  });
});

/* -------------------------------------------------------------------- F8 */

describe("F8: unsupported claims are not fabricated", () => {
  it("fees, deadlines, eligibility and document lists are never placeholders", () => {
    for (const s of listServices()) {
      for (const v of [s.feeInformation, s.deadlines]) {
        if (v !== undefined) expect(v).not.toMatch(/^(n\/a|tbd|unknown|none|\?+)$/i);
      }
      for (const list of [s.eligibility, s.requiredDocuments]) {
        if (list) expect(list.every((x) => x.trim().length > 0)).toBe(true);
      }
    }
  });

  it("sample records state no fees, deadlines, eligibility or document lists", () => {
    for (const s of listServices().filter((x) => x.sourceType === "sample")) {
      expect(s.feeInformation).toBeUndefined();
      expect(s.deadlines).toBeUndefined();
      expect(s.eligibility).toBeUndefined();
      expect(s.requiredDocuments).toBeUndefined();
    }
  });

  it("unverified sources declare themselves unconfirmed in their limitations", () => {
    for (const s of listServices().filter((x) => x.sourceType === "secondary_unverified")) {
      expect(s.limitations).toMatch(/unconfirmed/i);
      expect(s.limitations).toMatch(/\d{4}-\d{2}-\d{2}/); // dated review noted
    }
  });
});

/* -------------------------------------------------------------------- F9 */

describe("F9: empty and malformed records are rejected safely", () => {
  const valid: PublicService = listServices()[0];

  it("rejects an empty object", () => {
    expect(() => validateServiceRecord({})).toThrow();
  });

  it("rejects an empty title or category", () => {
    expect(() => validateServiceRecord({ ...valid, title: "" })).toThrow();
    expect(() => validateServiceRecord({ ...valid, category: "" })).toThrow();
  });

  it("rejects a malformed slug", () => {
    expect(() => validateServiceRecord({ ...valid, slug: "Bad Slug!" })).toThrow();
  });

  it("rejects an official record without a source link or review date", () => {
    expect(() => validateServiceRecord({ ...valid, sourceType: "official", officialUrl: null })).toThrow();
    expect(() => validateServiceRecord({ ...valid, sourceType: "official", lastReviewed: null })).toThrow();
  });

  it("rejects a sample record without a sample label or with invented fees", () => {
    expect(() =>
      validateServiceRecord({ ...valid, sourceType: "sample", limitations: "Looks fine." })
    ).toThrow();
    expect(() =>
      validateServiceRecord({
        ...valid,
        sourceType: "sample",
        limitations: "SAMPLE RECORD — sample.",
        officialUrl: null,
        lastReviewed: null,
        feeInformation: "Rs 50",
      })
    ).toThrow();
  });

  it("rejects self-referencing and placeholder values", () => {
    expect(() =>
      validateServiceRecord({ ...valid, relatedServices: [valid.slug] })
    ).toThrow();
    expect(() => validateServiceRecord({ ...valid, feeInformation: "TBD" })).toThrow();
    expect(() => validateServiceRecord({ ...valid, steps: [] })).toThrow();
  });

  it("accepts every real record unchanged", () => {
    for (const s of listServices()) {
      expect(validateServiceRecord(s).slug).toBe(s.slug);
    }
  });
});

/* --------------------------------------------------- knowledge integration */

describe("service records integrate with the knowledge engine (E)", () => {
  it("seeds official services, preserves existing sources, keeps sample out", async () => {
    const db = openTestDatabase();
    migrate(db);
    const kb = new LocalKnowledgeEngine(db);

    const sources = new SourceService(db);
    const all = await sources.listAll();
    const ids = all.map((s) => s.id);

    // pre-existing corpus preserved
    expect(ids).toContain("tg-meeseva-income-cert");
    expect(ids).toContain("goi-pmkisan");
    // official services seeded additively
    expect(ids).toContain("svc-caste-certificate");
    expect(ids).toContain("svc-passport-application");
    // sample records are not labelled official knowledge
    expect(ids).not.toContain("svc-electricity-connection");
    expect(ids).not.toContain("svc-water-connection");
    expect(ids).not.toContain("svc-social-security-pension");

    // idempotent: a second engine instance adds nothing
    void new LocalKnowledgeEngine(db);
    const count = db.prepare(`SELECT COUNT(*) AS n FROM government_sources`).get() as { n: number };
    expect(count.n).toBe(all.length);
    expect(count.n).toBeGreaterThanOrEqual(15);
    void kb;
  });

  it("preserves source id, title, URL, jurisdiction, review date and source type through retrieval", async () => {
    const db = openTestDatabase();
    migrate(db);
    const kb = new LocalKnowledgeEngine(db);

    const src = await kb.getSource("svc-national-scholarship");
    expect(src.id).toBe("svc-national-scholarship");
    expect(src.title).toBe("National Scholarship Portal (NSP)");
    expect(src.sourceUrl).toBe("https://scholarships.gov.in");
    expect(src.jurisdiction).toBe("Government of India");
    expect(src.lastVerified).toBe(TODAY);
    expect(src.sourceType).toBe("official");
    expect(src.content).toContain("scholarship");

    // Pre-existing rows fall back to their `state` for jurisdiction.
    const legacy = await kb.getSource("goi-pmkisan");
    expect(legacy.jurisdiction).toBe(legacy.state);
    expect(legacy.sourceType).toBe("official");
  });

  it("keyword search returns service excerpts with provenance intact", async () => {
    const db = openTestDatabase();
    migrate(db);
    const kb = new LocalKnowledgeEngine(db);

    const hits = await kb.search("driving licence", 5);
    const hit = hits.find((h) => h.documentId === "svc-driving-licence");
    expect(hit).toBeDefined();
    expect(hit!.sourceMetadata.sourceType).toBe("official");
    expect(hit!.sourceMetadata.jurisdiction).toBe("Telangana");
    expect(hit!.sourceMetadata.lastVerified).toBe(TODAY);
    expect(hit!.sourceMetadata.sourceUrl).toBe("https://transport.telangana.gov.in/");
  });

  it("only official service records are mapped, and only with official URLs", () => {
    const official = listServices().filter((s) => s.sourceType === "official");
    const expectedIds = new Set(
      official.map((s) => s.knowledgeSourceId).filter((x): x is string => Boolean(x))
    );
    expect(expectedIds.size).toBe(official.length); // every official record is grounded

    const sources = serviceDirectorySources();
    expect(new Set(sources.map((s) => s.id))).toEqual(expectedIds);
    for (const src of sources) {
      expect(src.sourceUrl).toMatch(/^https:\/\//);
      expect(src.text).toContain("Source type: official");
      expect(src.text).not.toMatch(/sample record/i);
    }
  });
});
