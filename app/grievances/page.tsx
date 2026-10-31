"use client";

import { useEffect, useState } from "react";
import { usePortal } from "../components/PortalProvider";
import { apiCreateGrievance, apiListGrievances, type GrievanceShape } from "../services/api";
import Link from "next/link";

const CATEGORIES = [
  "Water supply",
  "Road repair",
  "Sanitation & drainage",
  "Electricity",
  "Public health",
  "Education",
  "Land records",
  "Social welfare / pensions",
  "Other public service",
];

export default function GrievancesPage() {
  const { lang } = usePortal();
  const [tab, setTab] = useState<"submit" | "list">("submit");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [location, setLocation] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<GrievanceShape | null>(null);
  const [list, setList] = useState<GrievanceShape[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "list") return;
    setListLoading(true);
    setListError(null);
    apiListGrievances()
      .then((r) => setList(r.grievances))
      .catch((e) => setListError(e instanceof Error ? e.message : "Could not load grievances."))
      .finally(() => setListLoading(false));
  }, [tab]);

  async function submit() {
    if (!subject.trim() || !description.trim()) {
      setError("Subject and description are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const key = `gk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const r = await apiCreateGrievance({
        subject: subject.trim(),
        description: description.trim(),
        category,
        location: location.trim() || undefined,
        language: lang as "en" | "te" | "hi",
        idempotencyKey: key,
      });
      setConfirm(r.grievance);
      setSubject("");
      setDescription("");
      setLocation("");
      setReviewing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed. Your values are preserved — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main id="main-content">
      <div className="gov-container mt-2 space-y-4 pb-6">
        <div className="gov-card border-t-4 border-t-gov-blue p-4">
          <h1 className="text-xl font-extrabold text-gov-navy sm:text-2xl">Grievances</h1>
          <p className="mt-1 text-sm text-gov-muted">
            Record a public-service grievance for demonstration and tracking. It is not sent to a government department automatically.
          </p>
        </div>

        <div className="flex gap-2" role="tablist">
          <button type="button" className={tab === "submit" ? "gov-button-primary" : "gov-button-secondary"} onClick={() => setTab("submit")}>
            Submit a grievance
          </button>
          <button type="button" className={tab === "list" ? "gov-button-primary" : "gov-button-secondary"} onClick={() => setTab("list")}>
            My grievances
          </button>
        </div>

        {tab === "submit" ? (
          <>
            {confirm ? (
              <div className="gov-card">
                <h2 className="text-lg font-extrabold text-gov-greenDark mb-2">Recorded successfully</h2>
                <dl className="space-y-1 text-sm mb-3">
                  <div><dt className="font-bold">Reference</dt><dd>{confirm.referenceNumber}</dd></div>
                  <div><dt className="font-bold">Subject</dt><dd>{confirm.subject}</dd></div>
                  <div><dt className="font-bold">Category</dt><dd>{confirm.category}</dd></div>
                  <div><dt className="font-bold">Status</dt><dd>{confirm.status}</dd></div>
                  <div><dt className="font-bold">Submitted</dt><dd>{confirm.createdAt}</dd></div>
                </dl>
                <p className="text-sm font-semibold text-gov-red mb-3">
                  Your grievance has been recorded in GovLens for demonstration and tracking. It has not been submitted to a government department.
                </p>
                <Link href={`/grievances/${confirm.id}`} className="gov-button-primary min-h-[44px]">
                  View status &amp; history
                </Link>
                <button type="button" className="gov-button-secondary min-h-[44px] ml-2" onClick={() => setConfirm(null)}>
                  Submit another
                </button>
              </div>
            ) : (
              <div className="gov-card space-y-3">
                <div>
                  <label className="block text-sm font-bold text-gov-navy mb-1">Subject *</label>
                  <input className="w-full border rounded p-2 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gov-navy mb-1">Description *</label>
                  <textarea className="w-full border rounded p-2 text-sm min-h-[100px]" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gov-navy mb-1">Category *</label>
                  <select className="w-full border rounded p-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gov-navy mb-1">Location / area</label>
                  <input className="w-full border rounded p-2 text-sm" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} />
                </div>

                {error ? <p role="alert" className="text-sm text-gov-red">{error}</p> : null}

                {!reviewing ? (
                  <button type="button" className="gov-button-primary min-h-[44px]" onClick={() => { if (!subject.trim() || !description.trim()) { setError("Subject and description are required."); return; } setError(null); setReviewing(true); }}>
                    Review
                  </button>
                ) : (
                  <div className="border rounded p-3 space-y-2">
                    <p className="text-sm font-semibold text-gov-navy">Review before submitting</p>
                    <p className="text-sm"><b>Subject:</b> {subject}</p>
                    <p className="text-sm"><b>Category:</b> {category}</p>
                    {location ? <p className="text-sm"><b>Location:</b> {location}</p> : null}
                    <p className="text-xs text-gov-muted">
                      Do not include Aadhaar, bank details or other personal identifiers in the description.
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <button type="button" className="gov-button-secondary min-h-[44px]" onClick={() => setReviewing(false)} disabled={submitting}>
                        Edit
                      </button>
                      <button type="button" className="gov-button-primary min-h-[44px]" onClick={submit} disabled={submitting} aria-busy={submitting}>
                        {submitting ? "Submitting…" : "Confirm submission"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="gov-card space-y-3">
            {listLoading ? <p className="text-sm">Loading…</p> : null}
            {listError ? <p role="alert" className="text-sm text-gov-red">{listError}</p> : null}
            {!listLoading && !listError && list.length === 0 ? (
              <p className="text-sm text-gov-muted">No grievances recorded yet.</p>
            ) : null}
            {list.map((g) => (
              <article key={g.id} className="border rounded p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-gov-navy text-sm">{g.referenceNumber}</p>
                  <span className="gov-badge bg-gov-lightBlue text-gov-navy">{g.status}</span>
                </div>
                <p className="text-sm">{g.subject}</p>
                <p className="text-xs text-gov-muted">{g.category} · {g.createdAt}</p>
                <Link href={`/grievances/${g.id}`} className="text-xs text-gov-navy underline">
                  View details &amp; history
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
