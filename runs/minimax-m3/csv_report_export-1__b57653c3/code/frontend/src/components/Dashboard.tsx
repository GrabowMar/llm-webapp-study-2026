import { useEffect, useState } from "react";
import { ApiError, fetchSummary, listEntries, listProjects } from "../api";
import type { EntriesResponse, EntryFilters, SummaryItem } from "../types";
import EntryForm from "./EntryForm";
import EntryList from "./EntryList";
import FiltersBar from "./FiltersBar";
import TotalsPanel from "./TotalsPanel";

const emptyFilters: EntryFilters = { start_date: "", end_date: "", project: "" };

interface Props {
  username: string;
  onSignOut: () => void;
}

export default function Dashboard({ username, onSignOut }: Props) {
  const [filters, setFilters] = useState<EntryFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [entries, setEntries] = useState<EntriesResponse>({
    items: [],
    total: 0,
    page: 1,
    page_size: 25,
  });
  const [totals, setTotals] = useState<SummaryItem[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function refresh() {
    setRefreshKey((value) => value + 1);
  }

  function handleFiltersChange(next: EntryFilters) {
    setFilters(next);
    setPage(1);
  }

  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then((names) => {
        if (!cancelled) setProjects(names);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [list, summary] = await Promise.all([
          listEntries(filters, page, pageSize),
          fetchSummary({ start_date: filters.start_date, end_date: filters.end_date }),
        ]);
        if (cancelled) return;
        setEntries(list);
        setTotals(summary);
        setError(null);
        const lastPage = Math.max(1, Math.ceil(list.total / pageSize));
        if (page > lastPage) setPage(lastPage);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : "Could not load your entries.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters, page, pageSize, refreshKey]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white">
              T
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-900">Timesheet</h1>
              <p className="text-xs text-slate-500">Signed in as {username}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
        {error ? (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
            {error}
          </p>
        ) : null}

        <EntryForm projects={projects} onCreated={refresh} />

        <FiltersBar filters={filters} projects={projects} onChange={handleFiltersChange} />

        <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
          <EntryList
            items={entries.items}
            total={entries.total}
            page={entries.page}
            pageSize={pageSize}
            loading={loading}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onChanged={refresh}
          />
          <TotalsPanel items={totals} loading={loading} />
        </div>
      </main>
    </div>
  );
}
