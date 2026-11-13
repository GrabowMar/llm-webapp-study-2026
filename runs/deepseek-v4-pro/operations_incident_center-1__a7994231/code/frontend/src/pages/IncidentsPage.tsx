import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Incident, IncidentFilters, listIncidents } from "../api";
import { BreachedBadge, SeverityBadge, StatusBadge, formatDateTime } from "../components";

const SEVERITIES = ["sev1", "sev2", "sev3", "sev4"];
const STATUSES = ["investigating", "identified", "monitoring", "resolved"];

export default function IncidentsPage() {
  const [items, setItems] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    const filters: IncidentFilters = {
      severity: severity || undefined,
      status: status || undefined,
      open: openOnly ? true : null,
      q: q || undefined,
      page,
      page_size: pageSize,
    };
    setLoading(true);
    listIncidents(filters)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
        setPage(res.page);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [severity, status, openOnly, q, page, pageSize]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setQ(searchInput);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Incidents</h1>
        <Link
          to="/incidents/new"
          className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
        >
          Open incident
        </Link>
      </div>

      <form
        onSubmit={handleSearch}
        className="mb-4 flex flex-wrap items-end gap-3"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Search
          </label>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Title, service, commander…"
            className="w-64 rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Severity
          </label>
          <select
            value={severity}
            onChange={(e) => {
              setSeverity(e.target.value);
              setPage(1);
            }}
            className="rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
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
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => {
              setOpenOnly(e.target.checked);
              setPage(1);
            }}
            className="h-4 w-4"
          />
          Open only
        </label>
        <button
          type="submit"
          className="rounded bg-slate-700 px-4 py-2 font-semibold text-white hover:bg-slate-800"
        >
          Search
        </button>
      </form>

      {error && <p className="mb-4 text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Incident
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Service
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Severity
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Commander
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Opened
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  No incidents found.
                </td>
              </tr>
            )}
            {items.map((incident) => (
              <tr key={incident.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    to={`/incidents/${incident.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {incident.title}
                  </Link>
                  {incident.sla_breached && (
                    <div className="mt-1">
                      <BreachedBadge />
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-700">{incident.service}</td>
                <td className="px-4 py-3">
                  <SeverityBadge severity={incident.severity} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={incident.status} />
                </td>
                <td className="px-4 py-3 text-slate-700">{incident.commander}</td>
                <td className="px-4 py-3 text-slate-600">
                  {formatDateTime(incident.opened_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {total} incident{total === 1 ? "" : "s"} · page {page} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
          >
            Prev
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
