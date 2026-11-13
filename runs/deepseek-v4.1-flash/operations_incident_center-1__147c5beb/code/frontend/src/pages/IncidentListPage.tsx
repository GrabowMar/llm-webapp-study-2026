import { useEffect, useState } from "react";
import { fetchIncidents } from "../api";
import { Link } from "../router";
import type { Incident, IncidentList } from "../types";
import {
  SEVERITIES,
  STATUSES,
  formatDate,
  humanStatus,
  severityBadge,
  statusBadge,
  Notice,
} from "../ui";

const PAGE_SIZE = 10;

export function IncidentListPage() {
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<IncidentList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchIncidents({
      severity,
      status,
      open: openOnly ? "true" : "",
      q,
      page: String(page),
      page_size: String(PAGE_SIZE),
    })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load incidents.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [severity, status, openOnly, q, page]);

  useEffect(() => {
    setPage(1);
  }, [severity, status, openOnly, q]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Incidents</h1>
          <p className="mt-1 text-sm text-slate-600">
            {data ? `${data.total} incident${data.total === 1 ? "" : "s"}` : "Loading…"}
          </p>
        </div>
        <Link
          to="/incidents/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          Open incident
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="filter-severity" className="block text-xs font-medium text-slate-500">
            Severity
          </label>
          <select
            id="filter-severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="mt-1 block w-full rounded-md border-0 bg-white py-2 pl-3 pr-8 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600"
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
          <label htmlFor="filter-status" className="block text-xs font-medium text-slate-500">
            Status
          </label>
          <select
            id="filter-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1 block w-full rounded-md border-0 bg-white py-2 pl-3 pr-8 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanStatus(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-q" className="block text-xs font-medium text-slate-500">
            Search
          </label>
          <input
            id="filter-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Title, service, commander…"
            className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => setOpenOnly(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
            />
            Open only
          </label>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              {["Incident", "Severity", "Status", "Opened", "Target"].map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((incident: Incident) => (
              <tr key={incident.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    to={`/incidents/${incident.id}`}
                    className="font-medium text-indigo-600 hover:text-indigo-500"
                  >
                    {incident.title}
                  </Link>
                  <p className="text-xs text-slate-500">{incident.service}</p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase ring-1 ring-inset ${severityBadge(incident.severity)}`}
                  >
                    {incident.severity}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${statusBadge(incident.status)}`}
                  >
                    {humanStatus(incident.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {formatDate(incident.opened_at)}
                </td>
                <td className="px-4 py-3 text-sm">
                  {incident.sla_breached ? (
                    <span className="font-semibold text-red-600">Breached</span>
                  ) : (
                    <span className="text-slate-500">{formatDate(incident.sla_due_at)}</span>
                  )}
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                  No incidents match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {loading
            ? "Loading…"
            : `Page ${data?.page ?? 1} of ${totalPages}`}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
