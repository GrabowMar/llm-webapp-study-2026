import type { IncidentStatus, Severity } from "../api";

export const SEVERITIES: Severity[] = ["sev1", "sev2", "sev3", "sev4"];
export const STATUSES: IncidentStatus[] = [
  "investigating",
  "identified",
  "mitigated",
  "resolved",
];

const severityClasses: Record<Severity, string> = {
  sev1: "bg-red-100 text-red-800 ring-red-300",
  sev2: "bg-orange-100 text-orange-800 ring-orange-300",
  sev3: "bg-yellow-100 text-yellow-800 ring-yellow-300",
  sev4: "bg-sky-100 text-sky-800 ring-sky-300",
};

const statusClasses: Record<IncidentStatus, string> = {
  investigating: "bg-rose-50 text-rose-700 ring-rose-200",
  identified: "bg-amber-50 text-amber-700 ring-amber-200",
  mitigated: "bg-teal-50 text-teal-700 ring-teal-200",
  resolved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset ${severityClasses[severity] ?? "bg-gray-100 text-gray-700 ring-gray-300"}`}
    >
      {severity}
    </span>
  );
}

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusClasses[status] ?? "bg-gray-100 text-gray-700 ring-gray-300"}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export function BreachedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">
      ⚠ SLA breached
    </span>
  );
}

export function FieldErrors({ errors }: { errors: Record<string, string> | null }) {
  const entries = Object.entries(errors ?? {});
  if (entries.length === 0) return null;
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <p className="mb-1 font-semibold">Please fix the following:</p>
      <ul className="list-disc space-y-0.5 pl-5">
        {entries.map(([field, message]) => (
          <li key={field}>
            <span className="font-medium">{field}:</span> {message}
          </li>
        ))}
      </ul>
    </div>
  );
}
