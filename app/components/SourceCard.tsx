"use client";

import type { Source } from "../types/government-source";

export default function SourceCard({ sources, verified }: { sources: Source[]; verified: boolean }) {
  return (
    <section aria-label="Official sources" className="gov-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-gov-border bg-gov-offWhite px-4 py-3">
        <h2 className="text-base font-extrabold text-gov-navy">📚 Official Information</h2>
        <span className={`gov-badge ${verified ? "bg-gov-lightGreen text-gov-greenDark" : "bg-amber-100 text-amber-900"}`}>
          {verified ? "✓ Grounded" : "⚠ Unverified"}
        </span>
      </div>
      <div className="p-4">
        {sources.length === 0 ? (
          <p className="text-sm">
            No official source matched. GovLens did not guess — see the unverified notice above.
          </p>
        ) : (
          <ul className="space-y-2">
            {sources.map((s) => (
              <li key={s.id} className="rounded-gov border border-gov-border bg-gov-offWhite p-3">
                <p className="text-sm font-bold text-gov-navy">{s.title}</p>
                {s.department && <p className="text-xs text-gov-muted">{s.department}</p>}
                <p className="mt-0.5 font-mono text-[11px] text-gov-muted">source id: {s.id}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
