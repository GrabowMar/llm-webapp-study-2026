import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  currentUser,
  getToken,
  listReports,
  logout,
  onSessionEnded,
  recentLookups,
  setToken,
} from "./api";
import AuthPanel from "./components/AuthPanel";
import RecentLookups from "./components/RecentLookups";
import ReportsPanel from "./components/ReportsPanel";
import SearchPanel from "./components/SearchPanel";
import UnitToggle from "./components/UnitToggle";
import WeatherCard from "./components/WeatherCard";
import type { Lookup, Unit, WeatherReport } from "./types";

export default function App() {
  const [unit, setUnit] = useState<Unit>("C");
  const [username, setUsername] = useState<string | null>(null);
  const [report, setReport] = useState<WeatherReport | null>(null);
  const [missingCity, setMissingCity] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lookups, setLookups] = useState<Lookup[]>([]);

  const loadLookups = useCallback(async () => {
    try {
      const recent = await recentLookups(5);
      setLookups(recent.items);
    } catch {
      /* the recent list is a convenience, ignore failures */
    }
  }, []);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    currentUser()
      .then((user) => setUsername(user.username))
      .catch(() => {
        setToken(null);
        setUsername(null);
      });
  }, []);

  useEffect(
    () =>
      onSessionEnded(() => {
        setUsername(null);
      }),
    [],
  );

  async function handleSearch(city: string) {
    setSearching(true);
    setSearchError(null);
    try {
      const data = await listReports({ city });
      if (data.items.length > 0) {
        setReport(data.items[0]);
        setMissingCity(null);
      } else {
        setReport(null);
        setMissingCity(city);
      }
    } catch (error) {
      setReport(null);
      setMissingCity(null);
      setSearchError(
        error instanceof ApiError ? error.message : "Could not reach the server. Please try again.",
      );
    } finally {
      setSearching(false);
      void loadLookups();
    }
  }

  async function handleSignOut() {
    try {
      await logout();
    } catch {
      /* the local session is dropped either way */
    }
    setToken(null);
    setUsername(null);
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Weather Display</h1>
            <p className="text-sm text-slate-500">
              Current conditions served from our own store of weather reports.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <UnitToggle unit={unit} onChange={setUnit} />
            {username ? (
              <div className="flex items-center gap-2">
                <span
                  data-testid="signed-in-user"
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700"
                >
                  Signed in as {username}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-2">
        <div className="space-y-6">
          <SearchPanel onSearch={(city) => void handleSearch(city)} busy={searching} />

          {searchError && (
            <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {searchError}
            </p>
          )}

          {report ? (
            <WeatherCard report={report} unit={unit} />
          ) : missingCity ? (
            <p
              data-testid="no-weather-data"
              className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-slate-600"
            >
              No weather data for {missingCity}
            </p>
          ) : null}

          <RecentLookups lookups={lookups} onSelect={(city) => void handleSearch(city)} />
        </div>

        <div>{username ? <ReportsPanel unit={unit} /> : <AuthPanel onSignedIn={setUsername} />}</div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-slate-400">
        Every city lookup is recorded. Temperatures are stored in degrees Celsius.
      </footer>
    </div>
  );
}
