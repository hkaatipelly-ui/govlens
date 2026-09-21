"use client";

import type { ExtractedFields } from "../types/document-extraction";

function Row({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="border-t border-gov-border py-2 first:border-t-0 first:pt-0">
      <p className="text-xs font-bold uppercase tracking-wide text-gov-muted">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {values.map((v, i) => (
          <li key={i} className="text-base">• {v}</li>
        ))}
      </ul>
    </div>
  );
}

export default function StructuredFacts({ fields }: { fields: ExtractedFields }) {
  const simple: Array<[string, string | undefined]> = [
    ["Applicant", fields.applicantName],
    ["Application / ID", fields.applicationId],
    ["Office / Department", fields.officeOrDepartment],
  ];
  const hasSimple = simple.some(([, v]) => v);
  const hasLists =
    fields.dates.length + fields.amounts.length + fields.requiredDocuments.length + fields.deadlines.length > 0;

  if (!hasSimple && !hasLists) {
    return (
      <section aria-label="Extracted facts" className="gov-card p-4">
        <h2 className="gov-section-title !text-base">🔑 Key Facts</h2>
        <p className="mt-1 text-sm">
          No structured facts could be verified from the official information available to GovLens.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Extracted facts" className="gov-card p-4">
      <h2 className="gov-section-title !text-base">🔑 Key Facts</h2>
      <div className="mt-2">
        {simple.map(([label, v]) =>
          v ? (
            <div key={label} className="border-t border-gov-border py-2 first:border-t-0 first:pt-0">
              <p className="text-xs font-bold uppercase tracking-wide text-gov-muted">{label}</p>
              <p className="text-base font-semibold text-gov-navy">{v}</p>
            </div>
          ) : null
        )}
        <Row label="Dates" values={fields.dates} />
        <Row label="Amounts" values={fields.amounts} />
        <Row label="Documents needed" values={fields.requiredDocuments} />
        <Row label="Deadlines" values={fields.deadlines} />
      </div>
    </section>
  );
}
