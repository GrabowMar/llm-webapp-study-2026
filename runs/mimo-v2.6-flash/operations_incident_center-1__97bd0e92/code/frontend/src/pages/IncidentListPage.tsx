import { useEffect, useState } from "react";
import { api, ApiError, type IncidentList } from "../api";
import { Link, navigate } from "../router";
import {
  BreachBadge,
  ErrorAlert,
  PageHeader,
  SeverityBadge,
  StatusBadge,
  buttonPrimaryClass,
  buttonSecondaryClass,
  formatDate,
  inputClass,
} from "../ui";

const PAGE_SIZE = 10;
const SEVERITY_OPTIONS = ["sev1", "sev2", "sev3", "sev4"] as const;
const STATUS_OPTIONS = [
  "investigating",
  "identified",
  "mitigating",
  "monitoring",
  "resolved",
] as const;

export default function IncidentListPage() {
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<IncidentList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (severity) params.set("severity", severity);
    if (status) params.set("status", status);
    if (openOnly) params.set("open", "true");
    if (query.trim()) params.set("q", query.trim());
    params.set("page", String(page));
    params.set("page_size", String(PAGE_SIZE));
    api<IncidentList>(`/api/incidents?${params.toString()}`)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          navigate("/login");
          return;
        }
        setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [severity, status, openOnly, query, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  const resetAndSet = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  return (
    <div>
      <PageHeader title="Incidents">
        <Link to="/incidents/new" className={buttonPrimaryClass}>
          Open incident
        </Link>
      </PageHeader>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Severity
            </span>
            <select
              className={`${inputClass} w-40`}
              value={severity}
              onChange={(event) => resetAndSet(setSeverity)(event.target.value)}
            >
              <option value="">All severities</option>
              {SEVERITY_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Status
            </span>
            <select
              className={`${inputClass} w-44`}
              value={status}
              onChange={(event) => resetAndSet(setStatus)(event.target.value)}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="block flex-1 min-w-[12rem]">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Search
            </span>
            <input
              className={inputClass}
              type="search"
              placeholder="Title, service, commander…"
              value={query}
              onChange={(event) => resetAndSet(setQuery)(event.target.value)}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              checked={openOnly}
              onChange={(event) => {
                setOpenOnly(event.target.checked);
                setPage(1);
              }}
            />
            Open only
          </label>
        </div>
      </div>

      <div className="mt-4">
        <ErrorAlert message={error} />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Incident</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Opened</th>
              <th className="px-4 py-3">Commander</th>
              <th className="px-4 py-3">SLA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((incident) => (
              <tr
                key={incident.id}
                className={`cursor-pointer hover:bg-slate-50 ${
                  incident.sla_breached ? "bg-red-50/60" : ""
                }`}
                onClick={() => navigate(`/incidents/${incident.id}`)}
              >
                <td className="px-4 py-3">
                  <SeverityBadge severity={incident.severity} />
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/incidents/${incident.id}`}
                    className="font-semibold text-slate-900 hover:text-blue-700"
                  >
                    #{incident.id} · {incident.title}
                  </Link>
                  <div className="text-xs text-slate-500">{incident.service}</div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={incident.status} />
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {formatDate(incident.opened_at)}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {incident.commander || "—"}
                </td>
                <td className="px-4 py-3">
                  <BreachBadge breached={incident.sla_breached} />
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  No incidents match the current filters.
                </td>
              </tr>
            ) : null}
            {!data && !error ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  Loading incidents…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <span>
          {data
            ? `${data.total} incident${data.total === 1 ? "" : "s"} total`
            : "…"}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={buttonSecondaryClass}
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Previous
          </button>
          <span className="tabular-nums">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className={buttonSecondaryClass}
            disabled={page >= totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
