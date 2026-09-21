"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Breadcrumb from "../components/Breadcrumb";
import StatusBadge from "../components/StatusBadge";
import { apiListCases, type Case } from "../services/api";

const FILTERS = ["All", "Notices", "Applications", "Certificates", "Other"] as const;
type Filter = (typeof FILTERS)[number];

function classify(c: Case): Filter {
  const t = `${c.title} ${c.documentType}`.toLowerCase();
  if (/notice|order|memo|circular/.test(t)) return "Notices";
  if (/application|acknowledgement|receipt|request/.test(t)) return "Applications";
  if (/certificate|passbook|card|aadhaar/.test(t)) return "Certificates";
  return "Other";
}

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  needs_review: "Needs review",
  completed: "Completed",
};

export default function DocumentsPage() {
  const [cases, setCases] = useState<Case[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("All");

  useEffect(() => {
    apiListCases()
      .then((r) => setCases(r.cases))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load documents."));
  }, []);

  const visible = useMemo(
    () => (cases ?? []).filter((c) => filter === "All" || classify(c) === filter),
    [cases, filter]
  );

  return (
    <main id="main-content">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Documents" }]} />
      <div className="gov-container mt-2 space-y-4 pb-6">
        <div className="gov-card border-t-4 border-t-gov-blue p-4">
          <h1 className="text-xl font-extrabold text-gov-navy sm:text-2xl">My Documents</h1>
          <p className="mt-1 text-sm text-gov-muted">
            Every document you scan and analyse is listed here with its status.
          </p>
          <div role="group" aria-label="Filter documents" className="mt-3 flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`min-h-[44px] rounded-gov border px-4 text-sm font-bold ${
                  filter === f
                    ? "border-gov-blue bg-gov-blue text-white"
                    : "border-gov-border bg-white text-gov-blue hover:bg-gov-lightBlue"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-gov border border-gov-red bg-red-50 p-3 text-sm font-semibold text-gov-red">
            {error}
          </p>
        )}

        {cases === null && !error && <div className="gov-card p-6 text-center"><p>Loading documents…</p></div>}

        {cases !== null && visible.length === 0 && (
          <div className="gov-card p-6 text-center">
            <p className="text-lg font-extrabold text-gov-navy">No documents found</p>
            <p className="mt-1 text-sm text-gov-muted">
              {cases.length === 0
                ? "Scan your first document to see it listed here."
                : "No documents match this filter."}
            </p>
            <Link href="/scan" className="gov-btn-primary mt-3">📷 Scan a Document</Link>
          </div>
        )}

        {visible.length > 0 && (
          <div className="gov-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="gov-table">
                <thead>
                  <tr>
                    <th scope="col">Document</th>
                    <th scope="col">Type</th>
                    <th scope="col">Date</th>
                    <th scope="col">Deadline</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/caseworker/${c.id}`} className="font-bold text-gov-blue hover:underline">
                          {c.title}
                        </Link>
                        <br />
                        <span className="font-mono text-xs text-gov-muted">
                          {c.referenceNumber ?? c.id.slice(0, 8)}
                        </span>
                      </td>
                      <td><StatusBadge status={classify(c).toLowerCase()} label={classify(c)} /></td>
                      <td className="whitespace-nowrap">{new Date(c.createdAt).toLocaleDateString("en-IN")}</td>
                      <td>{c.deadline ?? "—"}</td>
                      <td>
                        <StatusBadge status={c.status} label={STATUS_LABEL[c.status] ?? c.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
