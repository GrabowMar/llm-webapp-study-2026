import { useCallback, useEffect, useState } from "react";
import { ApiError, api, getToken, setToken } from "./api";
import type { EntryPage, Filters, Summary } from "./types";
import AuthScreen from "./components/AuthScreen";
import EntryForm from "./components/EntryForm";
import EntryList from "./components/EntryList";
import FiltersBar from "./components/FiltersBar";
import TotalsPanel from "./components/TotalsPanel";

const EMPTY_FILTERS: Filters = { start_date: "", end_date: "", project: "" };

export default function App() {
  const [token, setTokenState] = useState<string | null>(() => getToken());

  if (!token) {
    return <AuthScreen onSignedIn={() => setTokenState(getToken())} />;
  }
  return (
    <Timesheet
      onSignedOut={() => {
        setToken(null);
        setTokenState(null);
      }}
    />
  );
}

function Timesheet({ onSignedOut }: { onSignedOut: () => void }) {
  const [username, setUsername] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [entries, setEntries] = useState<EntryPage | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [projects, setProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const signOut = useCallback(() => {
    api.logout().catch(() => undefined);
    onSignedOut();
  }, [onSignedOut]);

  useEffect(() => {
    api
      .username()
      .then((r) => setUsername(r.username))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) onSignedOut();
      });
  }, [onSignedOut]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, totals, projectsResp] = await Promise.all([
        api.listEntries(filters, page, pageSize),
        api.summary(filters),
        api.projects(),
      ]);
      setEntries(list);
      setSummary(totals);
      setProjects(projectsResp.projects);
      if (list.items.length === 0 && page > 1) {
        const lastPage = Math.max(1, Math.ceil(list.total / pageSize));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSignedOut();
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load your entries.");
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize, onSignedOut]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function applyFilters(next: Filters) {
    setFilters(next);
    setPage(1);
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold text-slate-800">
            Timesheet<span className="text-indigo-600">.</span>
          </h1>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-500">
              Signed in as <span className="font-semibold text-slate-800">{username}</span>
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

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <EntryForm suggestions={projects} onCreated={() => void reload()} />
        <FiltersBar filters={filters} projects={projects} onChange={applyFilters} />
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <EntryList
            items={entries?.items ?? []}
            total={entries?.total ?? 0}
            page={page}
            pageSize={pageSize}
            loading={loading}
            error={error}
            onPage={(p) => setPage(Math.max(1, p))}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
            onChanged={() => void reload()}
            onUnauthorized={onSignedOut}
          />
          <TotalsPanel summary={summary} loading={loading} />
        </div>
      </main>
    </div>
  );
}
