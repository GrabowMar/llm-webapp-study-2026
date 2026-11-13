import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  downloadFile,
  fetchEntries,
  fetchProjects,
  fetchTotals,
  filterQuery,
  type EntriesPage,
  type Filters,
  type ProjectTotal,
} from "../api";
import EntryTable from "./EntryTable";
import QuickEntryForm from "./QuickEntryForm";
import TotalsCard from "./TotalsCard";

const PAGE_SIZE = 10;

const filterFieldClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

type Props = {
  username: string;
  onSignOut: () => void;
};

export default function Timesheet({ username, onSignOut }: Props) {
  const [filters, setFilters] = useState<Filters>({
    start_date: "",
    end_date: "",
    project: "",
  });
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [entries, setEntries] = useState<EntriesPage | null>(null);
  const [totals, setTotals] = useState<ProjectTotal[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const handleUnauthorized = useCallback(() => {
    onSignOut();
  }, [onSignOut]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [pageData, projectTotals, projectNames] = await Promise.all([
          fetchEntries(filters, page, PAGE_SIZE),
          fetchTotals(filters),
          fetchProjects(),
        ]);
        if (cancelled) {
          return;
        }
        setEntries(pageData);
        setTotals(projectTotals);
        setProjects(projectNames);
        setError(null);
      } catch (err) {
        if (cancelled) {
          return;
        }
        if (err instanceof ApiError && err.status === 401) {
          onSignOut();
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load entries");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [filters, page, reloadKey, onSignOut]);

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function clearFilters() {
    setFilters({ start_date: "", end_date: "", project: "" });
    setPage(1);
  }

  async function handleExport(kind: "entries" | "summary") {
    setError(null);
    setNotice(null);
    try {
      if (kind === "entries") {
        await downloadFile(
          `/api/exports/entries.csv${filterQuery(filters)}`,
          "entries.csv",
        );
        setNotice("entries.csv downloaded");
      } else {
        await downloadFile(
          `/api/exports/summary.csv${filterQuery({
            start_date: filters.start_date,
            end_date: filters.end_date,
          })}`,
          "summary.csv",
        );
        setNotice("summary.csv downloaded");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSignOut();
        return;
      }
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }

  const totalPages = entries
    ? Math.max(1, Math.ceil(entries.total / entries.page_size))
    : 1;
  const hasFilters = Boolean(
    filters.start_date || filters.end_date || filters.project,
  );

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-semibold text-gray-900">Timesheet</h1>
            <span className="hidden text-sm text-gray-500 sm:inline">
              Personal time tracking
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">
              Signed in as{" "}
              <span className="font-medium text-gray-900">{username}</span>
            </span>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {error && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {notice}
          </div>
        )}

        <QuickEntryForm
          projects={projects}
          onCreated={() => {
            setNotice("Entry added");
            reload();
          }}
        />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[9.5rem] flex-1">
                  <label
                    htmlFor="filter-start"
                    className="block text-xs font-medium text-gray-700"
                  >
                    From
                  </label>
                  <input
                    id="filter-start"
                    type="date"
                    value={filters.start_date}
                    onChange={(event) =>
                      updateFilter("start_date", event.target.value)
                    }
                    className={filterFieldClass}
                  />
                </div>
                <div className="min-w-[9.5rem] flex-1">
                  <label
                    htmlFor="filter-end"
                    className="block text-xs font-medium text-gray-700"
                  >
                    To
                  </label>
                  <input
                    id="filter-end"
                    type="date"
                    value={filters.end_date}
                    onChange={(event) =>
                      updateFilter("end_date", event.target.value)
                    }
                    className={filterFieldClass}
                  />
                </div>
                <div className="min-w-[11rem] flex-1">
                  <label
                    htmlFor="filter-project"
                    className="block text-xs font-medium text-gray-700"
                  >
                    Project
                  </label>
                  <select
                    id="filter-project"
                    value={filters.project}
                    onChange={(event) =>
                      updateFilter("project", event.target.value)
                    }
                    className={filterFieldClass}
                  >
                    <option value="">All projects</option>
                    {projects.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={clearFilters}
                  disabled={!hasFilters}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear
                </button>
                <div className="flex gap-2 sm:ml-auto">
                  <button
                    type="button"
                    onClick={() => handleExport("entries")}
                    className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport("summary")}
                    className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                  >
                    Export totals
                  </button>
                </div>
              </div>
            </section>

            <EntryTable
              entries={entries}
              loading={loading}
              projects={projects}
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              onChanged={reload}
              onUnauthorized={handleUnauthorized}
            />
          </div>

          <TotalsCard totals={totals} />
        </div>
      </main>
    </div>
  );
}
