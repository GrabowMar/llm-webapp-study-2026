import { useCallback, useEffect, useState } from "react";

type WeatherReport = {
  id: number;
  city: string;
  country: string;
  temperature_c: number | null;
  condition: string | null;
  humidity: number | null;
  wind_kph: number | null;
  observed_at: string;
};

type Lookup = {
  id: number;
  city: string;
  found: boolean;
  looked_up_at: string;
};

type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

const TOKEN_KEY = "weather_token";

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return body as T;
}

function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}

function formatTemp(c: number | null, unit: "C" | "F"): string {
  if (c === null) return "—";
  const value = unit === "C" ? c : celsiusToFahrenheit(c);
  return `${value.toFixed(1)}°${unit}`;
}

function formatObserved(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function App() {
  const [user, setUser] = useState<string | null>(
    () => localStorage.getItem("weather_user") || null,
  );
  const [reports, setReports] = useState<WeatherReport[]>([]);
  const [recent, setRecent] = useState<Lookup[]>([]);
  const [unit, setUnit] = useState<"C" | "F">("C");
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<{
    city: string;
    report: WeatherReport | null;
  } | null>(null);
  const [searching, setSearching] = useState(false);

  const loadRecent = useCallback(async () => {
    try {
      const data = await api<{ items: Lookup[] }>("/api/weather/recent?limit=5");
      setRecent(data.items);
    } catch {
      /* ignore */
    }
  }, []);

  const loadReports = useCallback(async () => {
    try {
      const data = await api<Paged<WeatherReport>>(
        "/api/weather?page=1&page_size=1000",
      );
      setReports(data.items);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadReports();
    loadRecent();
  }, [loadReports, loadRecent]);

  const handleSearch = useCallback(
    async (city: string) => {
      const trimmed = city.trim();
      setQuery(trimmed);
      if (!trimmed) {
        setSearchResult(null);
        return;
      }
      setSearching(true);
      try {
        const data = await api<Paged<WeatherReport>>(
          `/api/weather?city=${encodeURIComponent(trimmed)}`,
        );
        setSearchResult({ city: trimmed, report: data.items[0] ?? null });
        loadRecent();
      } catch {
        setSearchResult({ city: trimmed, report: null });
      } finally {
        setSearching(false);
      }
    },
    [loadRecent],
  );

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem("weather_user");
    setUser(null);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-sky-600 text-white shadow">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold">Weather Display</h1>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="text-sm">Signed in as {user}</span>
                <button
                  onClick={handleLogout}
                  className="rounded bg-white/20 px-3 py-1 text-sm font-medium hover:bg-white/30"
                >
                  Sign out
                </button>
              </>
            ) : (
              <AuthForms onLogin={(name) => setUser(name)} />
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <section className="rounded-lg bg-white p-4 shadow">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">City search</h2>
            <button
              onClick={() => setUnit(unit === "C" ? "F" : "C")}
              className="ml-auto rounded bg-slate-200 px-3 py-1 text-sm font-medium hover:bg-slate-300"
            >
              {unit === "C" ? "Show °F" : "Show °C"}
            </button>
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch(query);
            }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter a city name"
              className="flex-1 rounded border border-slate-300 px-3 py-2 focus:border-sky-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={searching}
              className="rounded bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              Search
            </button>
          </form>
          {searchResult && (
            <div className="mt-4">
              {searchResult.report ? (
                <WeatherCard report={searchResult.report} unit={unit} />
              ) : (
                <p className="text-slate-500">
                  No weather data for {searchResult.city}
                </p>
              )}
            </div>
          )}
        </section>

        <section className="rounded-lg bg-white p-4 shadow">
          <h2 className="text-lg font-semibold">Recent lookups</h2>
          {recent.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No lookups yet.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {recent.map((l) => (
                <li key={l.id}>
                  <button
                    onClick={() => handleSearch(l.city)}
                    className="text-sm text-sky-700 hover:underline"
                  >
                    {l.city}
                  </button>
                  <span className="ml-2 text-xs text-slate-400">
                    {l.found ? "found" : "not found"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {user && (
          <ReportManager
            reports={reports}
            unit={unit}
            onChanged={() => {
              loadReports();
              loadRecent();
            }}
          />
        )}
      </main>
    </div>
  );
}

function AuthForms({ onLogin }: { onLogin: (username: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const data = await api<{ token?: string }>(path, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      if (mode === "register") {
        setMode("login");
        setUsername("");
        setPassword("");
        setError("Account created. Please sign in.");
        return;
      }
      if (data.token) {
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem("weather_user", username);
        onLogin(username);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          className="w-28 rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          className="w-28 rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-white/20 px-3 py-1 text-sm font-medium hover:bg-white/30 disabled:opacity-50"
        >
          {mode === "login" ? "Sign in" : "Register"}
        </button>
      </form>
      <button
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setError(null);
        }}
        className="text-sm text-white/80 hover:text-white"
      >
        {mode === "login" ? "Create account" : "Sign in"}
      </button>
      {error && (
        <span className="max-w-40 text-xs text-amber-200">{error}</span>
      )}
    </div>
  );
}

function WeatherCard({
  report,
  unit,
}: {
  report: WeatherReport;
  unit: "C" | "F";
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-semibold">{report.city}</h3>
          <p className="text-sm text-slate-500">{report.country}</p>
        </div>
        <p className="text-3xl font-bold text-sky-700">
          {formatTemp(report.temperature_c, unit)}
        </p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <span className="text-slate-500">Condition</span>
          <p>{report.condition ?? "—"}</p>
        </div>
        <div>
          <span className="text-slate-500">Humidity</span>
          <p>{report.humidity ?? "—"}%</p>
        </div>
        <div>
          <span className="text-slate-500">Wind</span>
          <p>{report.wind_kph ?? "—"} kph</p>
        </div>
        <div>
          <span className="text-slate-500">Observed</span>
          <p>{formatObserved(report.observed_at)}</p>
        </div>
      </div>
    </div>
  );
}

type FormState = {
  city: string;
  country: string;
  temperature_c: string;
  condition: string;
  humidity: string;
  wind_kph: string;
};

const EMPTY_FORM: FormState = {
  city: "",
  country: "",
  temperature_c: "",
  condition: "",
  humidity: "",
  wind_kph: "",
};

function ReportManager({
  reports,
  unit,
  onChanged,
}: {
  reports: WeatherReport[];
  unit: "C" | "F";
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<WeatherReport | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
  };

  const startEdit = (r: WeatherReport) => {
    setEditing(r);
    setForm({
      city: r.city,
      country: r.country,
      temperature_c: r.temperature_c?.toString() ?? "",
      condition: r.condition ?? "",
      humidity: r.humidity?.toString() ?? "",
      wind_kph: r.wind_kph?.toString() ?? "",
    });
    setError(null);
  };

  const set = (key: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const payload: Record<string, string | number | null> = {
      city: form.city,
      country: form.country,
      temperature_c: form.temperature_c === "" ? null : Number(form.temperature_c),
      condition: form.condition === "" ? null : form.condition,
      humidity: form.humidity === "" ? null : Number(form.humidity),
      wind_kph: form.wind_kph === "" ? null : Number(form.wind_kph),
    };
    try {
      if (editing) {
        await api(`/api/weather/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/weather", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      startAdd();
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: WeatherReport) => {
    if (!window.confirm(`Delete report for ${r.city}?`)) return;
    try {
      await api(`/api/weather/${r.id}`, { method: "DELETE" });
      if (editing?.id === r.id) startAdd();
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="rounded-lg bg-white p-4 shadow">
      <h2 className="text-lg font-semibold">Manage reports</h2>

      <form onSubmit={submit} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <input
          value={form.city}
          onChange={(e) => set("city", e.target.value)}
          placeholder="City"
          className="rounded border border-slate-300 px-2 py-1"
        />
        <input
          value={form.country}
          onChange={(e) => set("country", e.target.value)}
          placeholder="Country"
          className="rounded border border-slate-300 px-2 py-1"
        />
        <input
          value={form.temperature_c}
          onChange={(e) => set("temperature_c", e.target.value)}
          placeholder="Temperature (°C)"
          className="rounded border border-slate-300 px-2 py-1"
        />
        <input
          value={form.condition}
          onChange={(e) => set("condition", e.target.value)}
          placeholder="Condition"
          className="rounded border border-slate-300 px-2 py-1"
        />
        <input
          value={form.humidity}
          onChange={(e) => set("humidity", e.target.value)}
          placeholder="Humidity (%)"
          className="rounded border border-slate-300 px-2 py-1"
        />
        <input
          value={form.wind_kph}
          onChange={(e) => set("wind_kph", e.target.value)}
          placeholder="Wind (kph)"
          className="rounded border border-slate-300 px-2 py-1"
        />
        <div className="col-span-2 flex items-center gap-2 sm:col-span-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-sky-600 px-4 py-1.5 font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {editing ? "Save changes" : "Add report"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={startAdd}
              className="rounded bg-slate-200 px-4 py-1.5 font-medium hover:bg-slate-300"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <ul className="mt-4 divide-y divide-slate-200">
        {reports.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-2">
            <div>
              <span className="font-medium">{r.city}</span>
              <span className="ml-2 text-sm text-slate-500">{r.country}</span>
              <span className="ml-2 text-sm text-slate-500">
                {formatTemp(r.temperature_c, unit)}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => startEdit(r)}
                className="rounded bg-slate-200 px-2 py-1 text-sm hover:bg-slate-300"
              >
                Edit
              </button>
              <button
                onClick={() => remove(r)}
                className="rounded bg-red-100 px-2 py-1 text-sm text-red-700 hover:bg-red-200"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
