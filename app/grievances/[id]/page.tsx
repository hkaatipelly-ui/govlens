"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiGetGrievance, apiGrievanceHistory } from "../../services/api";
import Link from "next/link";

export default function GrievanceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [g, setG] = useState<any>(null);
  const [hist, setHist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([apiGetGrievance(id), apiGrievanceHistory(id)])
      .then(([gd, hd]) => {
        setG(gd.grievance);
        setHist(hd);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Access denied or record not found."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <main className="gov-container mt-4">Loading…</main>;
  if (error || !g) return <main className="gov-container mt-4"><p role="alert" className="text-gov-red">{error ?? "Access denied or record not found."}</p></main>;

  return (
    <main id="main-content">
      <div className="gov-container mt-2 space-y-4 pb-6">
        <Link href="/grievances" className="text-sm text-gov-navy underline">← Back to grievances</Link>
        <div className="gov-card">
          <h1 className="text-xl font-extrabold text-gov-navy">{g.subject}</h1>
          <dl className="space-y-1 text-sm mt-3">
            <div><dt className="font-bold">Reference</dt><dd>{g.referenceNumber}</dd></div>
            <div><dt className="font-bold">Category</dt><dd>{g.category}</dd></div>
            <div><dt className="font-bold">Location</dt><dd>{g.location ?? "—"}</dd></div>
            <div><dt className="font-bold">Status</dt><dd>{g.status}</dd></div>
            <div><dt className="font-bold">Submitted</dt><dd>{g.createdAt}</dd></div>
          </dl>
          <p className="mt-3 text-sm whitespace-pre-line">{g.description}</p>
          <p className="mt-3 text-sm font-semibold text-gov-red">
            Your grievance has been recorded in GovLens for demonstration and tracking. It has not been submitted to a government department.
          </p>
        </div>
        <div className="gov-card">
          <h2 className="text-lg font-extrabold text-gov-navy mb-2">Status history</h2>
          {hist?.history?.length ? (
            <ol className="space-y-2">
              {hist.history.map((h: any) => (
                <li key={h.id} className="border-l-2 border-gov-blue pl-3">
                  <p className="text-sm font-bold text-gov-navy">{h.newStatus}</p>
                  <p className="text-xs text-gov-muted">{h.createdAt}</p>
                  {h.publicMessage ? <p className="text-sm mt-1">{h.publicMessage}</p> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-gov-muted">No status events yet.</p>
          )}
          {hist?.internalNote ? null : null}
        </div>
      </div>
    </main>
  );
}
