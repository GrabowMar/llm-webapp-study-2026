const SEVERITY_STYLES: Record<string, string> = {
  sev1: "bg-red-100 text-red-800 border-red-300",
  sev2: "bg-orange-100 text-orange-800 border-orange-300",
  sev3: "bg-yellow-100 text-yellow-800 border-yellow-300",
  sev4: "bg-slate-100 text-slate-700 border-slate-300",
};

export function SeverityBadge({ severity }: { severity: string }) {
  const style = SEVERITY_STYLES[severity] ?? "bg-slate-100 text-slate-700 border-slate-300";
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold uppercase ${style}`}>
      {severity}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  investigating: "bg-red-50 text-red-700 border-red-200",
  identified: "bg-orange-50 text-orange-700 border-orange-200",
  monitoring: "bg-blue-50 text-blue-700 border-blue-200",
  resolved: "bg-green-50 text-green-700 border-green-200",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold capitalize ${style}`}>
      {status}
    </span>
  );
}

export function BreachedBadge() {
  return (
    <span className="inline-block rounded border border-red-400 bg-red-600 px-2 py-0.5 text-xs font-bold uppercase text-white">
      SLA breached
    </span>
  );
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
