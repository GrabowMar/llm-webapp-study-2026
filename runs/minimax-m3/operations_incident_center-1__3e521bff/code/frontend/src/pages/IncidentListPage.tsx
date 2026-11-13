import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api";
import { Link } from "../router";
import {
  BreachFlag,
  Card,
  ErrorBanner,
  SeverityBadge,
  StatusBadge,
  buttonGhost,
  buttonPrimary,
  inputClass,
} from "../ui";
import { SEVERITIES, STATUSES, type Incident, type IncidentListResponse } from "../types";
import { formatDateTime } from "../format";

const PAGE_SIZE = 20;

export default function IncidentListPage() {
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<IncidentListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const response = await api.listIncidents({
        severity: severity || undefined,
        status: status || undefined,
        open: openOnly ? true : undefined,
        q: query || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      setData(response);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load incidents");
    } finally {
      setLoading(false);
    }
  }, [severity, status, openOnly, query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = data?.items ?? [];

  const filtersActive = useMemo(
    () => Boolean(severity || status || openOnly || query),
    [severity, status, openOnly, query],
  );

  function resetFilters() {
    setSeverity("");
    setStatus("");
    setOpenOnly(false);
    setSearchInput("");
    setQuery("");
    setPage(1);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
            Operations
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-50">Incidents</h1>
          <p className="mt-2 text-sm text-slate-400">
            {loading ? "Loading…" : `${total} incident${total === 1 ? "" : "s"}`}
          </p>
        </div>
        <Link to="/incidents/new" className={buttonPrimary}>
          Open incident
        </Link>
      </div>

      <Card className="mt-6 p-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">
              Severity
            </span>
            <select
              className={inputClass}
              value={severity}
              onChange={(event) => {
                setSeverity(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All severities</option>
              {SEVERITIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">
              Status
            </span>
            <select
              className={inputClass}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">
              Search
            </span>
            <input
              className={inputClass}
              value={searchInput}
              placeholder="Title, service, commander…"
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>

          <div className="flex items-end justify-between gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={openOnly}
              onClick={() => {
                setOpenOnly((value) => !value);
                setPage(1);
              }}
              className="flex items-center gap-3 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500"
            >
              <span
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition ${
                  openOnly ? "bg-cyan-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                    openOnly ? "left-4.5" : "left-0.5"
                  }`}
                />
              </span>
              Open only
            </button>
            {filtersActive ? (
              <button
                type="button"
                onClick={resetFilters}
                className="text-sm text-slate-400 underline underline-offset-2 hover:text-slate-200"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </Card>

      {error ? (
        <div className="mt-4">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        {items.length === 0 && !loading ? (
          <Card className="p-10 text-center text-slate-400">
            No incidents match these filters.
          </Card>
        ) : null}

        {items.map((incident) => (
          <IncidentRow key={incident.id} incident={incident} />
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Page {data?.page ?? page} of {pageCount}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={buttonGhost}
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            className={buttonGhost}
            disabled={page >= pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function IncidentRow({ incident }: { incident: Incident }) {
  return (
    <Card className="p-4 transition hover:border-slate-600">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/incidents/${incident.id}`}
            className="text-base font-semibold text-slate-50 underline-offset-4 hover:underline"
          >
            {incident.title}
          </Link>
          <p className="mt-1 text-sm text-slate-400">
            <span className="font-mono text-slate-500">#{incident.id}</span>
            {incident.service ? (
              <>
                {" · "}
                <span>{incident.service}</span>
              </>
            ) : null}
            {incident.commander ? (
              <>
                {" · "}
                <span>commander {incident.commander}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={incident.severity} />
          <StatusBadge status={incident.status} />
          <BreachFlag breached={incident.sla_breached} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
        <span>Opened {formatDateTime(incident.opened_at)}</span>
        <span>Target {formatDateTime(incident.sla_due_at)}</span>
        <span>Opened by {incident.opened_by || "—"}</span>
        {incident.resolved_at ? (
          <span>Resolved {formatDateTime(incident.resolved_at)}</span>
        ) : null}
        {incident.reopen_count > 0 ? (
          <span>Reopened {incident.reopen_count}×</span>
        ) : null}
      </div>
    </Card>
  );
}
