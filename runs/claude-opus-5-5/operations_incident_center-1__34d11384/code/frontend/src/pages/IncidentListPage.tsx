import { useEffect, useState } from "react";
import { api, ApiError, SEVERITIES, STATUSES, type Incident, type Page } from "../api";
import { replaceSearch, useLocation } from "../router";
import {
  BreachedFlag,
  Card,
  ErrorBanner,
  Link,
  SeverityBadge,
  StatusBadge,
  buttonClass,
  formatDate,
  inputClass,
  secondaryButtonClass,
} from "../ui";

const PAGE_SIZE = 20;

export default function IncidentListPage() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const severity = params.get("severity") ?? "";
  const status = params.get("status") ?? "";
  const openOnly = params.get("open") === "true";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const [query, setQuery] = useState(q);
  const [data, setData] = useState<Page<Incident> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => setQuery(q), [q]);

  function update(changes: Record<string, string | null>, resetPage = true) {
    const next = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (resetPage && !("page" in changes)) next.delete("page");
    replaceSearch(next);
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (query.trim() !== q) update({ q: query.trim() });
    }, 300);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let active = true;
    const p = new URLSearchParams();
    if (severity) p.set("severity", severity);
    if (status) p.set("status", status);
    if (openOnly) p.set("open", "true");
    if (q) p.set("q", q);
    p.set("page", String(page));
    p.set("page_size", String(PAGE_SIZE));
    setLoading(true);
    api<Page<Incident>>(`/incidents?${p}`)
      .then((d) => {
        if (!active) return;
        setData(d);
        setError(null);
      })
      .catch((e) => active && setError(e instanceof ApiError ? e.message : "Could not load incidents"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [severity, status, openOnly, q, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Incidents</h1>
        <Link href="/incidents/new" className={buttonClass}>
          Open incident
        </Link>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-48 flex-1">
            <label htmlFor="q" className="mb-1 block text-xs font-medium text-slate-600">
              Search
            </label>
            <input
              id="q"
              type="search"
              placeholder="Title, service, commander…"
              className={inputClass}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") update({ q: query.trim() });
              }}
            />
          </div>
          <div>
            <label htmlFor="severity" className="mb-1 block text-xs font-medium text-slate-600">
              Severity
            </label>
            <select
              id="severity"
              className={inputClass}
              value={severity}
              onChange={(e) => update({ severity: e.target.value })}
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
            <label htmlFor="status" className="mb-1 block text-xs font-medium text-slate-600">
              Status
            </label>
            <select id="status" className={inputClass} value={status} onChange={(e) => update({ status: e.target.value })}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm font-medium text-slate-700">
            <button
              type="button"
              role="switch"
              aria-checked={openOnly}
              onClick={() => update({ open: openOnly ? null : "true" })}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                openOnly ? "bg-indigo-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  openOnly ? "translate-x-5" : ""
                }`}
              />
            </button>
            Open only
          </label>
        </div>
      </Card>

      <ErrorBanner message={error} />

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Opened</th>
              <th className="px-4 py-3">Target</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((i) => (
              <tr key={i.id} className={i.sla_breached ? "bg-red-50/60 hover:bg-red-50" : "hover:bg-slate-50"}>
                <td className="px-4 py-3 text-slate-500">{i.id}</td>
                <td className="px-4 py-3">
                  <Link href={`/incidents/${i.id}`} className="font-medium text-indigo-700 hover:underline">
                    {i.title}
                  </Link>
                </td>
                <td className="px-4 py-3">{i.service}</td>
                <td className="px-4 py-3">
                  <SeverityBadge severity={i.severity} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={i.status} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDate(i.opened_at)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600">{formatDate(i.sla_due_at)}</span>
                    {i.sla_breached && <BreachedFlag />}
                  </div>
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  No incidents match these filters.
                </td>
              </tr>
            )}
            {!data && loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            {data.total} incident{data.total === 1 ? "" : "s"} · page {data.page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={page <= 1}
              onClick={() => update({ page: page - 1 > 1 ? String(page - 1) : null }, false)}
            >
              Previous
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={page >= totalPages}
              onClick={() => update({ page: String(page + 1) }, false)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
