"use client";

import type { DocumentAnalysis } from "../types/document-extraction";

interface Props {
  analysis: DocumentAnalysis;
  lang: "en" | "te" | "hi";
}

export default function DocumentSummary({ analysis, lang }: Props) {
  const text =
    lang === "te" && analysis.summaryTelugu ? analysis.summaryTelugu : analysis.summary;
  return (
    <section aria-label="Plain language summary" className="gov-card overflow-hidden">
      <div className="border-b border-gov-border bg-gov-lightBlue px-4 py-3">
        <h2 className="text-base font-extrabold uppercase tracking-wide text-gov-navy sm:text-lg">
          📄 What this document means
        </h2>
      </div>
      <div className="p-4">
        {!analysis.verified && (
          <p className="rounded-gov border border-gov-saffron bg-amber-50 p-2 text-xs font-semibold text-amber-900">
            ⚠ Partly unverified — the local AI could not fully confirm this. Sources are listed below.
          </p>
        )}
        <p className="mt-2 text-base leading-relaxed">{text}</p>
      </div>
    </section>
  );
}
