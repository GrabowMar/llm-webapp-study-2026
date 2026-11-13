import { useEffect, useRef, useState } from "react";
import { api, ApiError, formatDate, SEVERITIES, STATUSES, statusLabel } from "../api";
import {
  Alert,
  BreachBadge,
  Button,
  Card,
  Loading,
  PageHeading,
  Select,
  SeverityBadge,
  StatusBadge,
  TextInput,
} from "../components";
import type { IncidentPage } from "../types";
import type { Navigate } from "../App";

const PAGE_SIZE = 10;

export default function IncidentsView({ navigate }: { navigate: Navigate }) {
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<IncidentPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [severity, status, openOnly, debouncedSearch]);

  useEffect(() => {
    const current = ++requestId.current;
    setLoading(true);
    api.listIncidents({
      severity: severity || undefined,
      status: status || undefined,
      open: openOnly || undefined,
      q: debouncedSearch || undefined,
      page,
      page_size: PAGE_SIZE,
    })
      .then((result) => {
        if (current === requestId.current) {
          setData(result);
          setError("");
        }
      })
      .catch((err) => {
        if (current === requestId.current) setError(err instanceof ApiError ? err.message : "Failed to load incidents.");
      })
      .finally(() => {
        if (current === requestId.current) setLoading(false);
      });
  }, [severity, status, openOnly, debouncedSearch, page]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeading
        title="Incidents"
        subtitle="Browse, filter and track all incidents, newest opened first."
        action={
          <Button onClick={() => navigate({ name: "open" })}>
            <span className="text-lg leading-none">+</span> Open incident
          </Button>
        }
      />

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="filter-severity" className="mb-1.5 block text-sm font-medium text-slate-700">Severity</label>
            <Select id="filter-severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="">All severities</option>
              {SEVERITIES.map((s) => <option key={s} value={s}>SEV {s.replace("sev", "")}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="filter-status" className="mb-1.5 block text-sm font-medium text-slate-700">Status</label>
            <Select id="filter-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </Select>
          </div>
          <div className="relative">
            <label htmlFor="filter-search" className="mb-1.5 block text-sm font-medium text-slate-700">Search</label>
            <TextInput
              id="filter-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title, service, commander…"
            />
          </div>
          <div className="flex items-end">
            <label className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <input
                type="checkbox"
                checked={openOnly}
                onChange={(e) => setOpenOnly(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-slate-700">Open only</span>
            </label>
          </div>
        </div>
        {(severity || status || search || openOnly) && (
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-500">
              {total} matching incident{total === 1 ? "" : "s"}
            </p>
            <button
              onClick={() => { setSeverity(""); setStatus(""); setSearch(""); setOpenOnly(false); }}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              Clear filters
            </button>
          </div>
        )}
      </Card>

      {error && <Alert>{error}</Alert>}
      {loading && !data && <Loading label="Loading incidents…" />}

      {data && (
        <>
          {data.items.length === 0 ? (
            <Card className="py-12 text-center text-sm text-slate-500">
              No incidents match your filters.
            </Card>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <ul className="divide-y divide-slate-100">
                {data.items.map((incident) => (
                  <li key={incident.id}>
                    <button
                      onClick={() => navigate({ name: "incident", id: incident.id })}
                      className="group flex w-full flex-col gap-3 px-5 py-4 text-left transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-mono text-slate-400">#{incident.id}</span>
                          <SeverityBadge severity={incident.severity} />
                          <StatusBadge status={incident.status} />
                          {incident.sla_breached && <BreachBadge />}
                        </div>
                        <p className="mt-1.5 truncate font-semibold text-slate-900 group-hover:text-indigo-700">{incident.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {incident.service || "No service"} · Opened {formatDate(incident.opened_at)}
                          {incident.commander ? ` · Commander: ${incident.commander}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-4 text-xs text-slate-500 sm:flex-col sm:items-end sm:gap-1">
                        <span>Target: {formatDate(incident.sla_due_at)}</span>
                        <span className="font-semibold text-indigo-600 group-hover:text-indigo-800">View →</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              Showing {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="px-2 text-sm font-medium text-slate-700">Page {page} of {totalPages}</span>
              <Button variant="secondary" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
