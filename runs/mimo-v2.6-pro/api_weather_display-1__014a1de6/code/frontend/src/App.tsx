import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { clearSession, fetchRecentLookups, fetchReports, getStoredUsername, storeSession } from "./api";
import AuthPanel from "./components/AuthPanel";
import RecentLookups from "./components/RecentLookups";
import ReportManager from "./components/ReportManager";
import WeatherCard from "./components/WeatherCard";
import type { Lookup, Unit, WeatherReport } from "./types";

export default function App() {
  const [unit, setUnit] = useState<Unit>("C");
  const [username, setUsername] = useState<string | null>(() => getStoredUsername());
  const [query, setQuery] = useState("");
  const [searchedCity, setSearchedCity] = useState<string | null>(null);
  const [result, setResult] = useState<WeatherReport | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lookups, setLookups] = useState<Lookup[]>([]);

  const refreshLookups = useCallback(async () => {
    try {
      setLookups(await fetchRecentLookups(5));
    } catch {
      setLookups([]);
    }
  }, []);

  useEffect(() => {
    refreshLookups();
  }, [refreshLookups]);

  const runSearch = useCallback(
    async (city: string) => {
      const term = city.trim();
      if (!term) return;
      setQuery(term);
      setSearchedCity(term);
      setResult(null);
      setSearchError(null);
      try {
        const page = await fetchReports(1, 1, term);
        setResult(page.items.length > 0 ? page.items[0] : null);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : "Search failed");
      }
      await refreshLookups();
    },
    [refreshLookups],
  );

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    void runSearch(query);
  }

  function handleSignedIn(name: string, token: string) {
    storeSession(token, name);
    setUsername(name);
  }

  function handleSignOut() {
    clearSession();
    setUsername(null);
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-sky-700 text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-5">
          <div>
            <h1 className="text-2xl font-bold">Weather Display</h1>
            <p className="text-sky-100">Current conditions from our own report store</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-sky-100">Units</span>
            <div className="flex overflow-hidden rounded-lg border border-white/40">
              <button
                type="button"
                onClick={() => setUnit("C")}
                className={
                  unit === "C"
                    ? "bg-white px-3 py-1.5 font-semibold text-sky-700"
                    : "px-3 py-1.5 text-white hover:bg-sky-600"
                }
              >
                °C
              </button>
              <button
                type="button"
                onClick={() => setUnit("F")}
                className={
                  unit === "F"
                    ? "bg-white px-3 py-1.5 font-semibold text-sky-700"
                    : "px-3 py-1.5 text-white hover:bg-sky-600"
                }
              >
                °F
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {username ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-slate-900">
              Signed in as <span className="font-semibold">{username}</span>
            </p>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        ) : (
          <AuthPanel onSignedIn={handleSignedIn} />
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Look up a city</h2>
          <form className="mt-4 flex flex-wrap gap-2" onSubmit={handleSearch}>
            <input
              aria-label="City"
              placeholder="City name"
              className="min-w-56 flex-1 rounded-lg border border-slate-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="submit"
              className="rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700"
            >
              Search
            </button>
          </form>

          <div className="mt-4">
            {searchError ? (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                {searchError}
              </p>
            ) : null}
            {result ? (
              <WeatherCard report={result} unit={unit} />
            ) : searchedCity && !searchError ? (
              <p className="rounded-lg bg-slate-50 p-4 text-slate-700">
                No weather data for {searchedCity}
              </p>
            ) : null}
          </div>
        </section>

        <RecentLookups lookups={lookups} onSelect={(city) => void runSearch(city)} />

        {username ? (
          <ReportManager unit={unit} />
        ) : (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Manage reports</h2>
            <p className="mt-2 text-slate-500">
              Sign in to add, edit or delete weather reports.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
