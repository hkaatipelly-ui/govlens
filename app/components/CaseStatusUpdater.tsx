"use client";

import { useState } from "react";
import { apiPatchCase, type CaseStatus } from "../services/api";

const OPTIONS: Array<{ value: CaseStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "needs_review", label: "Needs review" },
  { value: "completed", label: "Completed" },
];

export default function CaseStatusUpdater({
  caseId,
  initial,
  onChanged,
}: {
  caseId: string;
  initial: CaseStatus;
  onChanged: (s: CaseStatus) => void;
}) {
  const [status, setStatus] = useState<CaseStatus>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: CaseStatus) => {
    setSaving(true);
    setError(null);
    try {
      // PATCH /api/cases/:id
      const { case: updated } = await apiPatchCase(caseId, next);
      setStatus(updated.status);
      onChanged(updated.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="case-status" className="text-sm font-bold text-gov-navy">
        Case status:
      </label>
      <select
        id="case-status"
        value={status}
        disabled={saving}
        onChange={(e) => save(e.target.value as CaseStatus)}
        className="min-h-[44px] rounded-gov border border-gov-border bg-white px-3 text-sm font-bold"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {saving && <span className="text-xs text-gov-muted">Saving…</span>}
      {error && (
        <span role="alert" className="text-xs font-bold text-gov-red">
          {error}
        </span>
      )}
    </div>
  );
}
