import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "../api";
import type { IncidentPage } from "../types";
import { SEVERITIES, STATUSES } from "../types";
import {
  BreachBadge,
  ErrorBanner,
  SeverityBadge,
  StatusBadge,
  formatTimestamp,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../ui";

const PAGE_SIZE = 20;

export default function IncidentListPage() {
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<IncidentPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listIncidents({
        severity: severity || undefined,
        status: status || undefined,
        open: openOnly ? true : undefined,
        q: q || undefined,
        page,
        page_size: PAGE_SIZE,
      })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Failed to load incidents");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [severity, status, openOnly, q, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Incidents</h1>
          <p className="mt-1 text-sm text-slate-500">Newest incidents first.</p>
        </div>
        <Link to="/incidents/new" className={primaryButtonClass}>
          Open incident
        </Link>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="filter-severity" className="block text-sm font-medium text-slate-700">
              Severity
            </label>
            <select
              id="filter-severity"
              className={`${inputClass} mt-1`}
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All severities</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-status" className="block text-sm font-medium text-slate-700">
              Status
            </label>
            <select
              id="filter-status"
              className={`${inputClass} mt-1`}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-q" className="block text-sm font-medium text-slate-700">
              Search
            </label>
            <input
              id="filter-q"
              type="search"
              className={`${inputClass} mt-1`}
              placeholder="Title, service, impact..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                checked={openOnly}
                onChange={(e) => {
                  setOpenOnly(e.target.checked);
                  setPage(1);
                }}
              />
              Open only
            </label>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <ErrorBanner message={error} />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Incident</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Severity</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Opened</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Resolution target</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">SLA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data && data.items.length > 0 ? (
              data.items.map((incident) => (
                <tr key={incident.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/incidents/${incident.id}`}
                      className="font-medium text-indigo-700 hover:text-indigo-500 hover:underline"
                    >
                      {incident.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-500">{incident.service}</p>
                  </td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={incident.severity} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={incident.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{formatTimestamp(incident.opened_at)}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{formatTimestamp(incident.sla_due_at)}</td>
                  <td className="px-4 py-3">
                    {incident.sla_breached ? <BreachBadge /> : <span className="text-sm text-slate-400">on target</span>}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                  {loading ? "Loading incidents..." : "No incidents match the current filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            {data.total} incident{data.total === 1 ? "" : "s"} - page {data.page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => totalPages <= 7 || Math.abs(p - page) <= 2 || p === 1 || p === totalPages)
              .map((p, index, list) => (
                <span key={p} className="flex items-center gap-2">
                  {index > 0 && p - list[index - 1] > 1 ? <span className="text-slate-400">...</span> : null}
                  <button
                    type="button"
                    onClick={() => setPage(p)}
                    className={
                      p === page
                        ? "inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
                        : secondaryButtonClass
                    }
                  >
                    {p}
                  </button>
                </span>
              ))}
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
