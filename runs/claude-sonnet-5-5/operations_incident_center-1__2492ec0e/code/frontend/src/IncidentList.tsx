import { useEffect, useState } from "react";
import { api, SEVERITIES, STATUSES, type IncidentPage } from "./api";
import { Link } from "./router";
import {
  BreachedFlag,
  btnCls,
  btnSecondaryCls,
  ErrorBox,
  formatTime,
  inputCls,
  SeverityBadge,
  StatusBadge,
} from "./ui";

export function IncidentList() {
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<IncidentPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (severity) params.set("severity", severity);
    if (status) params.set("status", status);
    if (openOnly) params.set("open", "true");
    if (q) params.set("q", q);
    api
      .incidents(params)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [severity, status, openOnly, q, page]);

  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Incidents</h1>
        <Link to="/incidents/new" className={btnCls}>
          Open incident
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 shadow">
        <input
          className={`${inputCls} max-w-xs`}
          placeholder="Search..."
          aria-label="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={`${inputCls} w-auto`}
          aria-label="Severity"
          value={severity}
          onChange={(e) => {
            setSeverity(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s.toUpperCase()}
            </option>
          ))}
        </select>
        <select
          className={`${inputCls} w-auto`}
          aria-label="Status"
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
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            role="switch"
            checked={openOnly}
            onChange={(e) => {
              setOpenOnly(e.target.checked);
              setPage(1);
            }}
          />
          Open only
        </label>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {!data && !error && <p className="text-slate-500">Loading...</p>}
      {data && (
        <>
          <div className="overflow-x-auto rounded-lg bg-white shadow">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">Incident</th>
                  <th className="px-3 py-2">Service</th>
                  <th className="px-3 py-2">Severity</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Opened</th>
                  <th className="px-3 py-2">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((i) => (
                  <tr key={i.id} className={i.sla_breached ? "bg-red-50" : ""}>
                    <td className="px-3 py-2">
                      <Link to={`/incidents/${i.id}`} className="font-medium text-indigo-600 hover:underline">
                        #{i.id} {i.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{i.service}</td>
                    <td className="px-3 py-2">
                      <SeverityBadge severity={i.severity} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={i.status} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatTime(i.opened_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatTime(i.sla_due_at)} {i.sla_breached && <BreachedFlag />}
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      No incidents found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>
              {data.total} incident{data.total === 1 ? "" : "s"} - page {data.page} of {lastPage}
            </span>
            <div className="flex gap-2">
              <button className={btnSecondaryCls} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <button className={btnSecondaryCls} disabled={page >= lastPage} onClick={() => setPage(page + 1)}>
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
