const STYLES: Record<string, string> = {
  new: "bg-gov-lightBlue text-gov-navy",
  pending: "bg-amber-100 text-amber-900",
  in_review: "bg-amber-100 text-amber-900",
  verified: "bg-gov-lightGreen text-gov-greenDark",
  grounded: "bg-gov-lightGreen text-gov-greenDark",
  unverified: "bg-amber-100 text-amber-900",
  resolved: "bg-gov-lightGreen text-gov-greenDark",
  completed: "bg-gov-lightGreen text-gov-greenDark",
  notice: "bg-gov-lightBlue text-gov-navy",
  certificate: "bg-gov-lightGreen text-gov-greenDark",
  application: "bg-purple-100 text-purple-900",
  other: "bg-slate-100 text-slate-700",
  expired: "bg-red-100 text-gov-red",
};

export default function StatusBadge({ status, label }: { status: string; label?: string }) {
  const cls = STYLES[status] ?? STYLES.other;
  return <span className={`gov-badge ${cls}`}>{label ?? status.replace(/_/g, " ")}</span>;
}
