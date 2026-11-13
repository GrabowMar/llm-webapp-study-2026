import { STATUS_LABELS } from "../types";

const STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  trial: "bg-sky-50 text-sky-700 ring-sky-600/20",
  past_due: "bg-amber-50 text-amber-800 ring-amber-600/20",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-500/20",
  open: "bg-amber-50 text-amber-800 ring-amber-600/20",
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

export default function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? "bg-slate-100 text-slate-600 ring-slate-500/20";
  const label = STATUS_LABELS[status] ?? status.replace(/_/g, " ");
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}
    >
      {label}
    </span>
  );
}
