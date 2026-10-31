import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumb from "@/app/components/Breadcrumb";
import StatusBadge from "@/app/components/StatusBadge";
import {
  CATEGORY_LABELS,
  getRelatedServices,
  getServiceBySlug,
  listServices,
} from "@/app/lib/service-directory";
import { sourceBadge, sourceReviewLabel } from "@/app/types/service";

/** Service detail (Phase 3) — one page per directory record. */
export function generateStaticParams() {
  return listServices().map((s) => ({ slug: s.slug }));
}

/** The directory is fully static: unknown slugs must return a real 404. */
export const dynamicParams = false;

export function generateMetadata({ params }: { params: { slug: string } }) {
  const service = getServiceBySlug(params.slug);
  if (!service) notFound();
  return { title: `${service.title} · GovLens` };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-gov border border-gov-border bg-white p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-gov-muted">{label}</p>
      <div className="mt-1 text-sm text-gov-navy">{children}</div>
    </div>
  );
}

export default function ServiceDetailPage({ params }: { params: { slug: string } }) {
  const service = getServiceBySlug(params.slug);
  if (!service) notFound();

  const badge = sourceBadge(service.sourceType);
  const related = getRelatedServices(service);

  return (
    <main id="main-content">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Services", href: "/services" },
          { label: service.title },
        ]}
      />
      <div className="gov-container mt-2 space-y-4 pb-6">
        <section className="gov-card border-t-4 border-t-gov-blue p-4">
          <h1 className="text-xl font-extrabold text-gov-navy sm:text-2xl">{service.title}</h1>
          <p className="mt-1 text-sm text-gov-muted">{service.summary}</p>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={badge.status} label={badge.label} />
            <StatusBadge status="notice" label={CATEGORY_LABELS[service.category]} />
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Department">
              <span>{service.department}</span>
            </Field>
            <Field label="Jurisdiction">
              <span>{service.jurisdiction}</span>
            </Field>
          </dl>
        </section>

        <section aria-labelledby="about" className="gov-card p-4">
          <h2 id="about" className="text-base font-extrabold text-gov-navy">About this service</h2>
          <p className="mt-2 text-sm leading-6">{service.description}</p>
          <p className="mt-3 text-sm">
            <span className="font-bold text-gov-navy">Who it helps: </span>
            {service.whoItHelps}
          </p>
          {service.aliases.length > 0 && (
            <p className="mt-2 text-sm text-gov-muted">
              <span className="font-bold text-gov-navy">Also known as: </span>
              {service.aliases.join(", ")}
            </p>
          )}
        </section>

        <section aria-labelledby="steps" className="gov-card p-4">
          <h2 id="steps" className="text-base font-extrabold text-gov-navy">
            Steps <span className="text-sm font-semibold text-gov-muted">(overview)</span>
          </h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            {service.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="details" className="gov-card p-4">
          <h2 id="details" className="text-base font-extrabold text-gov-navy">
            Eligibility, documents, fees and deadlines
          </h2>
          {service.eligibility ||
          service.requiredDocuments ||
          service.feeInformation ||
          service.deadlines ? (
            <dl className="mt-2 grid gap-3 sm:grid-cols-2">
              {service.eligibility && (
                <Field label="Eligibility">
                  <ul className="list-disc space-y-1 pl-5">
                    {service.eligibility.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </Field>
              )}
              {service.requiredDocuments && (
                <Field label="Required documents">
                  <ul className="list-disc space-y-1 pl-5">
                    {service.requiredDocuments.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </Field>
              )}
              {service.feeInformation && <Field label="Fees">{service.feeInformation}</Field>}
              {service.deadlines && <Field label="Deadlines">{service.deadlines}</Field>}
            </dl>
          ) : (
            <p className="mt-2 text-sm text-gov-muted">
              Fees, deadlines and document lists are not recorded for this service because
              they could not be confirmed from an official source. GovLens does not guess
              them — check with the department before you apply.
            </p>
          )}
        </section>

        <section aria-labelledby="source" className="gov-card p-4">
          <h2 id="source" className="text-base font-extrabold text-gov-navy">Source information</h2>
          <p className="mt-2 text-sm">
            <span className="font-bold text-gov-navy">Source: </span>
            {service.officialUrl ? (
              <a
                href={service.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-gov-blue underline"
              >
                {service.officialUrl}
              </a>
            ) : (
              <span className="text-gov-muted">No official link is recorded for this entry.</span>
            )}
          </p>
          <p className="mt-1 text-sm">
            <span className="font-bold text-gov-navy">Review status: </span>
            {sourceReviewLabel(service)}
          </p>
          <p className="mt-2 rounded-gov border border-gov-border bg-gov-lightBlue p-3 text-sm">
            {service.limitations}
          </p>
        </section>

        {related.length > 0 && (
          <section aria-labelledby="related" className="gov-card p-4">
            <h2 id="related" className="text-base font-extrabold text-gov-navy">Related services</h2>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {related.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/services/${r.slug}`}
                    className="gov-card block p-3 text-sm hover:shadow-gov-md hover:ring-2 hover:ring-gov-blue"
                  >
                    <span className="font-bold text-gov-navy">{r.title}</span>
                    <span className="mt-0.5 block text-gov-muted">{r.jurisdiction}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Link
          href="/services"
          className="inline-block min-h-[44px] rounded-gov border border-gov-blue bg-white px-4 py-2 text-sm font-bold text-gov-blue hover:bg-gov-lightBlue"
        >
          ← Back to all services
        </Link>
      </div>
    </main>
  );
}
