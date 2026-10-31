"use client";

import { useState } from "react";
import Link from "next/link";
import StatusBadge from "./StatusBadge";
import {
  CATEGORY_LABELS,
  searchServices,
  serviceCategories,
} from "../lib/service-directory";
import type { PublicService, ServiceCategory } from "../types/service";
import { sourceBadge, sourceReviewLabel } from "../types/service";

/**
 * Service directory search + filter (Phase 3). Receives the validated records
 * from the server page as props — it never keeps a second hardcoded list.
 */
export default function ServiceDirectory({ services }: { services: PublicService[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ServiceCategory | "">("");

  const categories = serviceCategories(services);
  const results = searchServices({ query, category, services });

  return (
    <section aria-labelledby="directory-heading" className="gov-card p-4">
      <h2 id="directory-heading" className="text-lg font-extrabold text-gov-navy">
        Service directory
      </h2>
      <p className="mt-1 text-sm text-gov-muted">
        Search by what you need — for example “ration card”, “driving licence” or “how do I
        apply for a passport”. Scope: Telangana services plus selected central-government
        services.
      </p>

      <div role="search" className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="service-search" className="block text-sm font-bold text-gov-navy">
            Search services
          </label>
          <input
            id="service-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. ration card, property tax, scholarship"
            className="mt-1 min-h-[44px] w-full rounded-gov border border-gov-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gov-blue"
          />
        </div>
        <div>
          <label htmlFor="service-category" className="block text-sm font-bold text-gov-navy">
            Category
          </label>
          <select
            id="service-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as ServiceCategory | "")}
            className="mt-1 min-h-[44px] w-full rounded-gov border border-gov-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gov-blue"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} ({c.count})
              </option>
            ))}
          </select>
        </div>
      </div>

      <p aria-live="polite" className="mt-3 text-sm font-semibold text-gov-muted">
        {results.length === 0
          ? "No services match your search."
          : `${results.length} service${results.length === 1 ? "" : "s"} listed.`}
      </p>

      {results.length === 0 && (
        <div className="rounded-gov border border-gov-border bg-gov-lightBlue p-4 text-sm">
          <p className="font-bold text-gov-navy">No matching services</p>
          <p className="mt-1 text-gov-muted">
            Try a simpler phrase (for example “pension” or “tax”), or clear the filters.
            GovLens only lists a curated set of Telangana and central services — it is not a
            complete list of every service in India.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCategory("");
            }}
            className="mt-2 min-h-[44px] rounded-gov border border-gov-blue bg-white px-4 text-sm font-bold text-gov-blue hover:bg-gov-lightBlue"
          >
            Clear search and filters
          </button>
        </div>
      )}

      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {results.map((s) => {
          const badge = sourceBadge(s.sourceType);
          return (
            <li key={s.id}>
              <Link
                href={`/services/${s.slug}`}
                className="gov-card block h-full border-t-4 border-t-gov-blue p-4 hover:shadow-gov-md hover:ring-2 hover:ring-gov-blue"
              >
                <p className="text-base font-extrabold text-gov-navy">{s.title}</p>
                <p className="mt-1 text-sm text-gov-muted">{s.summary}</p>
                <p className="mt-2 text-xs font-semibold text-gov-navy">
                  {CATEGORY_LABELS[s.category]}
                </p>
                <p className="mt-0.5 text-xs text-gov-muted">
                  {s.department} · {s.jurisdiction}
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={badge.status} label={badge.label} />
                  <span className="text-xs text-gov-muted">{sourceReviewLabel(s)}</span>
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
