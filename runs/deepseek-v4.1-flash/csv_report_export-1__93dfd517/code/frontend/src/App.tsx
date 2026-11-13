import { useCallback, useEffect, useMemo, useState } from "react";
import AuthScreen from "./AuthScreen";
import EntryTable from "./EntryTable";
import QuickEntry from "./QuickEntry";
import {
  ApiError,
  downloadCsv,
  entriesCsvUrl,
  getToken,
  listEntries,
  listProjects,
  logout,
  me,
  setToken,
  summaryCsvUrl,
  type Entry,
  type Filters,
  type ProjectTotal,
} from "./api";

const PAGE_SIZE = 10;

const emptyFilters: Filters = { start_date: "", end_date: "", project: "" };

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : String(Number(hours.toFixed(2)));
}

export default function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const signOut = useCallback(() => {
    setToken(null);
    setUsername(null);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    me()
      .then((result) => setUsername(result.username))
      .catch(() => setToken(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (!username) {
    return <AuthScreen onSignedIn={setUsername} />;
  }

  return <Dashboard username={username} onSignedOut={signOut} />;
}

function Dashboard({
  username,
  onSignedOut,
}: {
  username: string;
  onSignedOut: () => void;
}) {
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [projects, setProjects] = useState<ProjectTotal[]>([]);
  const [allProjects, setAllProjects] = useState<ProjectTotal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      listEntries(filters, page, PAGE_SIZE),
      listProjects(filters),
      listProjects(emptyFilters),
    ])
      .then(([entryPage, projectTotals, allProjectTotals]) => {
        if (cancelled) return;
        setEntries(entryPage.items);
        setTotal(entryPage.total);
        setProjects(projectTotals.items);
        setAllProjects(allProjectTotals.items);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          onSignedOut();
          return;
        }
        setError(err instanceof ApiError ? err.message : "Unable to load entries.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, page, refreshKey, onSignedOut]);

  const suggestions = useMemo(
    () =>
      allProjects
        .map((project) => project.project)
        .sort((a, b) => a.localeCompare(b)),
    [allProjects],
  );

  const grandTotal = useMemo(
    () => projects.reduce((sum, project) => sum + project.hours, 0),
    [projects],
  );

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (!loading && page > pageCount) setPage(pageCount);
  }, [loading, page, pageCount]);

  function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    if (
      draft.start_date &&
      draft.end_date &&
      draft.start_date > draft.end_date
    ) {
      setError("The start date must be on or before the end date.");
      return;
    }
    setError("");
    setPage(1);
    setFilters({ ...draft });
  }

  function clearFilters() {
    setDraft(emptyFilters);
    setFilters(emptyFilters);
    setPage(1);
  }

  async function signOut() {
    try {
      await logout();
    } catch {
      // Ignore network errors on sign-out; the local token is cleared anyway.
    }
    onSignedOut();
  }

  async function exportFile(url: string, filename: string) {
    setExportError("");
    if (
      draft.start_date &&
      draft.end_date &&
      draft.start_date > draft.end_date
    ) {
      setExportError("The start date must be on or before the end date.");
      return;
    }
    try {
      await downloadCsv(url, filename);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSignedOut();
        return;
      }
      setExportError("Export failed. Please try again.");
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-slate-900">Timesheet</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">
              Signed in as{" "}
              <span className="font-medium text-slate-900">{username}</span>
            </span>
            <button
              onClick={signOut}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <QuickEntry suggestions={suggestions} onCreated={refresh} />

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  exportFile(entriesCsvUrl(filters), "entries.csv")
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Export CSV
              </button>
              <button
                onClick={() =>
                  exportFile(summaryCsvUrl(filters), "summary.csv")
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Export totals
              </button>
            </div>
          </div>

          <form
            onSubmit={applyFilters}
            className="grid grid-cols-1 gap-3 md:grid-cols-12"
          >
            <div className="md:col-span-3">
              <label
                htmlFor="filter-start"
                className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                From
              </label>
              <input
                id="filter-start"
                type="date"
                value={draft.start_date}
                onChange={(e) =>
                  setDraft({ ...draft, start_date: e.target.value })
                }
                className={inputClass}
              />
            </div>
            <div className="md:col-span-3">
              <label
                htmlFor="filter-end"
                className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                To
              </label>
              <input
                id="filter-end"
                type="date"
                value={draft.end_date}
                onChange={(e) =>
                  setDraft({ ...draft, end_date: e.target.value })
                }
                className={inputClass}
              />
            </div>
            <div className="md:col-span-4">
              <label
                htmlFor="filter-project"
                className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                Project
              </label>
              <select
                id="filter-project"
                value={draft.project}
                onChange={(e) =>
                  setDraft({ ...draft, project: e.target.value })
                }
                className={inputClass}
              >
                <option value="">All projects</option>
                {suggestions.map((project) => (
                  <option key={project} value={project}>
                    {project}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2 md:col-span-2">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Clear
              </button>
            </div>
          </form>

          {exportError && (
            <p className="mt-3 text-sm text-red-600">{exportError}</p>
          )}
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 lg:col-span-1">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Totals by project
              </h2>
            </div>
            <ul className="space-y-2 text-sm">
              {projects.length === 0 && (
                <li className="text-slate-500">No hours in this period.</li>
              )}
              {projects.map((project) => (
                <li
                  key={project.project}
                  className="flex items-center justify-between gap-2"
                >
                  <button
                    onClick={() => {
                      const next = { ...draft, project: project.project };
                      setDraft(next);
                      setFilters(next);
                      setPage(1);
                    }}
                    className="truncate text-left text-slate-700 hover:text-indigo-600 hover:underline"
                    title={project.project}
                  >
                    {project.project}
                  </button>
                  <span className="whitespace-nowrap tabular-nums font-medium text-slate-900">
                    {formatHours(project.hours)} h
                  </span>
                </li>
              ))}
            </ul>
            {projects.length > 0 && (
              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-sm font-semibold text-slate-900">
                <span>Total</span>
                <span className="tabular-nums">{formatHours(grandTotal)} h</span>
              </div>
            )}
          </section>

          <section className="space-y-3 lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Entries</h2>
              <span className="text-sm text-slate-500">
                {loading ? "Loading…" : `${total} entr${total === 1 ? "y" : "ies"}`}
              </span>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {!loading && entries.length === 0 && !error ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
                No entries match your filters yet.
              </div>
            ) : (
              <EntryTable entries={entries} onChanged={refresh} />
            )}

            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>
                Page {page} of {pageCount}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page >= pageCount}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
