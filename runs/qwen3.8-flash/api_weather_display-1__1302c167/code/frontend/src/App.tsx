import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Lookup, Report } from "./api";
import { ApiError, clearSession, getUsername, getToken, recentLookups, searchCity } from "./api";
import AuthPanel from "./components/AuthPanel";
import ReportsPanel from "./components/ReportsPanel";
import WeatherCard from "./components/WeatherCard";
import type { Unit } from "./components/WeatherCard";

interface SearchResult {
  query: string;
  report: Report | null;
}

export default function App() {
  const [signedIn, setSignedIn] = useState<string | null>(() => (getToken() ? getUsername() : null));
  const [unit, setUnit] = useState<Unit>("C");
  const [cityInput, setCityInput] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lookups, setLookups] = useState<Lookup[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadLookups = useCallback(async () => {
    try {
      const res = await recentLookups(5);
      setLookups(res.items);
    } catch {
      /* recent list is best-effort */
    }
  }, []);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  async function search(city: string) {
    const query = city.trim();
    if (!query) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await searchCity(query);
      setResult({ query, report: res.items[0] ?? null });
      await loadLookups();
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    search(cityInput);
  }

  function signOut() {
    clearSession();
    setSignedIn(null);
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-sky-600">Weather</span> Display
          </h1>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex rounded-lg border border-slate-300 p-0.5 text-sm font-medium">
              {(["C", "F"] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  className={`rounded-md px-3 py-1 ${
                    unit === u ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  °{u}
                </button>
              ))}
            </div>
            <AuthPanel
              signedIn={signedIn}
              onSignIn={(_token, username) => {
                setSignedIn(username);
                setRefreshKey((k) => k + 1);
              }}
              onSignOut={signOut}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        <section className="space-y-4">
          <form onSubmit={onSearchSubmit} className="flex gap-2">
            <input
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              placeholder="Search a city, e.g. London"
              className="w-full max-w-xs rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={searching}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </form>

          {searchError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{searchError}</p>}

          {result &&
            (result.report ? (
              <WeatherCard report={result.report} unit={unit} />
            ) : (
              <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-slate-600">
                No weather data for <span className="font-semibold">{result.query}</span>
              </p>
            ))}

          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Recent lookups
            </h2>
            {lookups.length === 0 ? (
              <p className="text-sm text-slate-500">No lookups yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {lookups.map((l) => (
                  <li key={l.id}>
                    <button
                      onClick={() => {
                        setCityInput(l.city);
                        search(l.city);
                      }}
                      className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm hover:border-sky-400 hover:bg-sky-50"
                    >
                      <span className="font-medium">{l.city}</span>
                      <span
                        className={`h-2 w-2 rounded-full ${l.found ? "bg-emerald-500" : "bg-red-400"}`}
                        title={l.found ? "found" : "not found"}
                      />
                      <span className="text-xs text-slate-500">{new Date(l.looked_up_at).toLocaleTimeString()}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {signedIn && <ReportsPanel unit={unit} refreshKey={refreshKey} />}
      </main>
    </div>
  );
}
