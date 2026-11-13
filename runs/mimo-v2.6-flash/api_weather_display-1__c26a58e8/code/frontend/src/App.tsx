import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  api,
  clearSession,
  getUsername,
  getToken,
  setSession,
  type Lookup,
  type WeatherReport,
} from "./api";
import AuthPanel from "./components/AuthPanel";
import RecentLookups from "./components/RecentLookups";
import ReportsPanel from "./components/ReportsPanel";
import SearchPanel from "./components/SearchPanel";
import type { Unit } from "./format";

export default function App() {
  const [username, setUsername] = useState<string | null>(() =>
    getToken() ? getUsername() : null,
  );
  const [unit, setUnit] = useState<Unit>("C");
  const [authMode, setAuthMode] = useState<"signin" | "register" | null>(null);

  const [query, setQuery] = useState("");
  const [searchedCity, setSearchedCity] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<WeatherReport | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [recent, setRecent] = useState<Lookup[]>([]);
  const [reports, setReports] = useState<WeatherReport[]>([]);
  const [reportsError, setReportsError] = useState<string | null>(null);

  const loadRecent = useCallback(async () => {
    try {
      const data = await api.recentLookups(5);
      setRecent(data.items);
    } catch {
      // keep whatever list we already have
    }
  }, []);

  const loadReports = useCallback(async () => {
    if (!getToken()) return;
    try {
      const data = await api.listReports(1, 100);
      setReports(data.items);
      setReportsError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearSession();
        setUsername(null);
        setReports([]);
      } else {
        setReportsError(err instanceof Error ? err.message : "Failed to load reports");
      }
    }
  }, []);

  useEffect(() => {
    void loadRecent();
    if (getToken()) void loadReports();
  }, [loadRecent, loadReports]);

  const runSearch = useCallback(
    async (city: string) => {
      const trimmed = city.trim();
      if (!trimmed) return;
      setSearchError(null);
      try {
        const data = await api.searchCity(trimmed);
        setSearchedCity(trimmed);
        setSearchResult(data.items.length > 0 ? data.items[0] : null);
        await loadRecent();
      } catch (err) {
        setSearchedCity(null);
        setSearchResult(null);
        setSearchError(err instanceof Error ? err.message : "Search failed");
      }
    },
    [loadRecent],
  );

  function handlePickRecent(city: string) {
    setQuery(city);
    void runSearch(city);
  }

  function handleAuthed(token: string, name: string) {
    setSession(token, name);
    setUsername(name);
    setAuthMode(null);
    setReportsError(null);
    void loadReports();
  }

  function handleSignOut() {
    clearSession();
    setUsername(null);
    setReports([]);
    setReportsError(null);
    setAuthMode(null);
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <h1 className="text-xl font-bold tracking-tight text-sky-700">Weather</h1>
          <div className="flex items-center gap-3">
            {username ? (
              <>
                <span className="text-sm text-slate-600">
                  Signed in as <span className="font-semibold text-slate-800">{username}</span>
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setAuthMode("signin")}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode("register")}
                  className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
                >
                  Register
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {!username && authMode && (
          <AuthPanel mode={authMode} onModeChange={setAuthMode} onAuthed={handleAuthed} />
        )}

        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2">
            <SearchPanel
              unit={unit}
              onUnitChange={setUnit}
              query={query}
              onQueryChange={setQuery}
              onSearch={(city) => void runSearch(city)}
              searchedCity={searchedCity}
              report={searchResult}
              error={searchError}
            />
          </div>
          <aside>
            <RecentLookups items={recent} onPick={handlePickRecent} />
          </aside>
        </div>

        {username && (
          <ReportsPanel
            reports={reports}
            unit={unit}
            loadError={reportsError}
            onChanged={() => void loadReports()}
          />
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-8 text-center text-xs text-slate-400">
        Weather display · data served from the local store
      </footer>
    </div>
  );
}
