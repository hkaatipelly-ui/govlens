"use client";

import type { ChecklistItem } from "../types/checklist-item";

interface Props {
  items: ChecklistItem[];
  onToggle?: (id: string) => void;
  interactive?: boolean;
  title?: string;
}

export default function ActionChecklist({ items, onToggle, interactive = false, title = "What You Need To Do" }: Props) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className="gov-card p-4">
      <h2 className="gov-section-title !text-base">✅ {title}</h2>
      <ol className="mt-3 space-y-2">
        {items.map((item, idx) => (
          <li key={item.id} className="flex items-start gap-3 rounded-gov border border-gov-border bg-gov-offWhite p-3">
            {interactive ? (
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => onToggle?.(item.id)}
                aria-label={`Mark done: ${item.label}`}
                className="mt-1 h-6 w-6 shrink-0 accent-[#1E5AA8]"
              />
            ) : (
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gov-blue text-sm font-extrabold text-white"
              >
                {idx + 1}
              </span>
            )}
            <div>
              <p className={`font-bold text-gov-navy ${item.done ? "line-through opacity-60" : ""}`}>
                {item.label}
              </p>
              {item.detail && <p className="text-sm text-gov-muted">{item.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
