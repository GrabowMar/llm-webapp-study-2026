import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  EntryPage,
  Filters,
  downloadCsv,
  errorMessage,
  listEntries,
} from "../api";
import EntryForm from "./EntryForm";
import EntryTable from "./EntryTable";

const PAGE_SIZE = 10;
const FETCH_ALL = 1000;

interface Props {
  onSessionExpired: () => void;
}

interface ProjectTotal {
  project: string;
  hours: number;
}

const EMPTY_PAGE: EntryPage = { items: [], total: 0, page: 1, page_size: PAGE_SIZE };

export default function Timesheet({ onSessionExpired }: Props) {
  const [filters, setFilters] = useState<Filters>({
    start_date: "",
    end_date: "",
    project: "",
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<EntryPage>(EMPTY_PAGE);
  const [totals, setTotals] = useState<ProjectTotal[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setError(errorMessage(err));
    },
    [onSessionExpired],
  );

  const refresh = useCallback(() => {
    setError(null);
    setRefreshKey((key) => key + 1);
  }, []);

  const setFilter = (name: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [name]: value }));
    setPage(1);
  };

  useEffect(() => {
    let cancelled = false;
    listEntries({ ...filters, page, page_size: PAGE_SIZE })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
        if (result.items.length === 0 && result.total > 0 && page > lastPage) {
          setPage(lastPage);
        }
      })
      .catch((err) => {
        if (!cancelled) handleError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, page, refreshKey, handleError]);

  useEffect(() => {
    let cancelled = false;
    listEntries({ ...filters, page: 1, page_size: FETCH_ALL })
      .then((result) => {
        if (cancelled) return;
        const sums = new Map<string, number>();
        for (const entry of result.items) {
          sums.set(entry.project, (sums.get(entry.project) ?? 0) + entry.hours);
        }
        const next = [...sums.entries()]
          .map(([project, hours]) => ({ project, hours }))
          .sort((a, b) => a.project.localeCompare(b.project));
        setTotals(next);
      })
      .catch((err) => {
        if (!cancelled) handleError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, refreshKey, handleError]);

  useEffect(() => {
    let cancelled = false;
    listEntries({ page: 1, page_size: FETCH_ALL })
      .then((result) => {
        if (cancelled) return;
        const names = [...new Set(result.items.map((entry) => entry.project))];
        names.sort((a, b) => a.localeCompare(b));
        setProjects(names);
      })
      .catch((err) => {
        if (!cancelled) handleError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, handleError]);

  async function exportEntries() {
    setError(null);
    try {
      await downloadCsv(
        "/api/exports/entries.csv",
        {
          start_date: filters.start_date,
          end_date: filters.end_date,
          project: filters.project,
        },
        "entries.csv",
      );
    } catch (err) {
      handleError(err);
    }
  }

  async function exportTotals() {
    setError(null);
    try {
      await downloadCsv(
        "/api/exports/summary.csv",
        { start_date: filters.start_date, end_date: filters.end_date },
        "summary.csv",
      );
    } catch (err) {
      handleError(err);
    }
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const totalHours = totals.reduce((sum, item) => sum + item.hours, 0);
  const fieldClass =
    "rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <div className="space-y-6">
      <EntryForm projects={projects} onCreated={refresh} />

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="filter-start" className="block text-sm font-medium text-slate-700">
                From
              </label>
              <input
                id="filter-start"
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilter("start_date", e.target.value)}
                className={`mt-1 ${fieldClass}`}
              />
            </div>
            <div>
              <label htmlFor="filter-end" className="block text-sm font-medium text-slate-700">
                To
              </label>
              <input
                id="filter-end"
                type="date"
                value={filters.end_date}
                onChange={(e) => setFilter("end_date", e.target.value)}
                className={`mt-1 ${fieldClass}`}
              />
            </div>
            <div>
              <label htmlFor="filter-project" className="block text-sm font-medium text-slate-700">
                Project
              </label>
              <select
                id="filter-project"
                value={filters.project}
                onChange={(e) => setFilter("project", e.target.value)}
                className={`mt-1 ${fieldClass}`}
              >
                <option value="">All projects</option>
                {projects.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportEntries}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={exportTotals}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Export totals
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Entries</h2>
        <div className="mt-4">
          <EntryTable entries={data.items} projects={projects} onChanged={refresh} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {data.total} {data.total === 1 ? "entry" : "entries"} · Page {data.page} of{" "}
            {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={page >= totalPages}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Per-project totals</h2>
        {totals.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No time logged for the current filters.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {totals.map((item) => (
              <li key={item.project} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium text-slate-900">{item.project}</span>
                <span className="text-slate-700">{item.hours} h</span>
              </li>
            ))}
            <li className="flex items-center justify-between py-2 text-sm font-semibold text-slate-900">
              <span>Total</span>
              <span>{totalHours} h</span>
            </li>
          </ul>
        )}
      </section>
    </div>
  );
}
