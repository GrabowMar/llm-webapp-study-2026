import type { Priority } from "../api";

const styles: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-600 ring-slate-200",
  medium: "bg-amber-100 text-amber-700 ring-amber-200",
  high: "bg-rose-100 text-rose-700 ring-rose-200",
};

export default function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${styles[priority]}`}
    >
      {priority}
    </span>
  );
}
