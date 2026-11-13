import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type Incident,
  type IncidentList,
  type IncidentStatus,
  type Severity,
} from "../api";
import { formatTime, timeUntil } from "../format";
import { BreachedBadge, SEVERITIES, SeverityBadge, STATUSES, StatusBadge } from "../components/ui";

export default function IncidentListPage() {
  const [severity, setSeverity] = useState<Severity | "">("");
  const [status, setStatus] = useState<IncidentStatus | "">("");
  const [openOnly, setOpenOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<IncidentList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    api
      .listIncidents({
        severity: severity || undefined,
        status: status || undefined,
        open: openOnly ? "true" : undefined,
        q: q || undefined,
        page,
        page_size: 10,
      })
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((e) => setError(e.message ?? "failed to load incidents"));
  }, [severity, status, openOnly, q, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Incidents</h1>
        <Link
          to="/incidents/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          Open incident
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
            Severity
          </label>
          <select
            value={severity}
            onChange={(e) => {
              setSeverity(e.target.value as Severity | "");
              setPage(1);
            }}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as IncidentStatus | "");
              setPage(1);
            }}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => {
              setOpenOnly(e.target.checked);
              setPage(1);
            }}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600"
          />
          Open only
        </label>
        <div className="min-w-48 flex-1">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
            Search
          </label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="title, service or impact…"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Incident</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Opened</th>
                <th className="px-4 py-3">SLA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.items.map((inc: Incident) => (
                <tr key={inc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/incidents/${inc.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      #{inc.id} {inc.title}
                    </Link>
                    {inc.sla_breached && (
                      <div className="mt-1">
                        <BreachedBadge />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{inc.service}</td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={inc.severity} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inc.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                    {formatTime(inc.opened_at)}
                  </td>
                  <td
                    className={`px-4 py-3 whitespace-nowrap ${
                      inc.sla_breached ? "font-semibold text-red-600" : "text-gray-500"
                    }`}
                  >
                    {inc.status === "resolved" ? "closed" : timeUntil(inc.sla_due_at)}
                  </td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                    No incidents match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>
            {data.total} incident{data.total === 1 ? "" : "s"} — page {data.page} of{" "}
            {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-medium hover:bg-gray-50 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-medium hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
