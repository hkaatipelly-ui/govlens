import Link from "next/link";
import { Fragment } from "react";

export interface Crumb {
  label: string;
  href?: string;
}

export default function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="gov-container pt-3">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-gov-muted">
        {items.map((item, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <li aria-hidden className="text-gov-border">
                /
              </li>
            )}
            <li>
              {item.href && i < items.length - 1 ? (
                <Link href={item.href} className="font-semibold text-gov-blue hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page" className="font-semibold text-gov-ink">
                  {item.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
