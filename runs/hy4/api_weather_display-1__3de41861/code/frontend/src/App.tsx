import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  api,
  HttpError,
  setToken,
  type Lookup,
  type ReportForm,
  type ReportPayload,
  type WeatherReport,
} from "./api";

type Unit = "C" | "F";

const emptyPayload: ReportForm = {
  city: "",
  country: "",
  temperature_c: "",
  condition: "",
  humidity: "",
  wind_kph: "",
};

function errorText(err: unknown): string {
  if (err instanceof HttpError) {
    return err.data.message || err.data.error || err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

function fieldErrors(err: unknown): Record<string, string> {
  return err instanceof HttpError ? err.data.errors || {} : {};
}

function displayTemp(celsius: number, unit: Unit): string {
  const value = unit === "C" ? celsius : celsius * 1.8 + 32;
  return `${value.toFixed(1)}°${unit}`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 placeholder:text-slate-400";
const labelClass = "block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1";
const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-50";
const secondaryBtn =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50";
const dangerBtn =
  "inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-200";

export default function App() {
  const [token, setTokenState] = useState<string | null>(() => {
    const stored = localStorage.getItem("weather_token");
    return stored;
  });
  const [username, setUsername] = useState<string>(
    () => localStorage.getItem("weather_username") || "",
  );
  const [unit, setUnit] = useState<Unit>("C");

  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authFieldErrors, setAuthFieldErrors] = useState<Record<string, string>>({});
  const [authBusy, setAuthBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [result, setResult] = useState<WeatherReport | null>(null);
  const [searchedCity, setSearchedCity] = useState("");
  const [searchError, setSearchError] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [recent, setRecent] = useState<Lookup[]>([]);

  const [reports, setReports] = useState<WeatherReport[]>([]);
  const [reportsBusy, setReportsBusy] = useState(false);
  const [reportsError, setReportsError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ReportForm>(emptyPayload);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);

  const loadRecent = useCallback(async () => {
    try {
      const data = await api.recent(5);
      setRecent(data.items);
    } catch {
      /* keep the previous list on transient failures */
    }
  }, []);

  const loadReports = useCallback(async () => {
    setReportsBusy(true);
    setReportsError("");
    try {
      const data = await api.reports(1, 100);
      setReports(data.items);
    } catch (err) {
      setReportsError(errorText(err));
    } finally {
      setReportsBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    if (!token) return;
    void api.me()
      .then((me) => {
        setUsername(me.username);
        localStorage.setItem("weather_username", me.username);
      })
      .catch(() => {
        setToken(null);
        setTokenState(null);
        setUsername("");
        localStorage.removeItem("weather_username");
      });
    void loadReports();
  }, [token, loadReports]);

  const doSearch = useCallback(
    async (city: string) => {
      const trimmed = city.trim();
      if (!trimmed) return;
      setSearchBusy(true);
      setSearchError("");
      setQuery(trimmed);
      setSearchedCity(trimmed);
      try {
        const data = await api.search(trimmed);
        setResult(data.items[0] || null);
      } catch (err) {
        setResult(null);
        setSearchError(errorText(err));
      } finally {
        setSearchBusy(false);
        void loadRecent();
      }
    },
    [loadRecent],
  );

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    setAuthFieldErrors({});
    try {
      if (authMode === "register") {
        const created = await api.register(authUsername.trim(), authPassword);
        const { token: newToken } = await api.login(created.username, authPassword);
        applyLogin(newToken, created.username);
      } else {
        const { token: newToken } = await api.login(
          authUsername.trim(),
          authPassword,
        );
        applyLogin(newToken, authUsername.trim());
      }
      setAuthPassword("");
    } catch (err) {
      setAuthError(errorText(err));
      setAuthFieldErrors(fieldErrors(err));
    } finally {
      setAuthBusy(false);
    }
  }

  function applyLogin(newToken: string, name: string) {
    setToken(newToken);
    setTokenState(newToken);
    setUsername(name);
    localStorage.setItem("weather_username", name);
    setAuthError("");
    setAuthFieldErrors({});
  }

  function signOut() {
    setToken(null);
    setTokenState(null);
    setUsername("");
    localStorage.removeItem("weather_username");
    setReports([]);
    setEditingId(null);
    setForm(emptyPayload);
  }

  function startAdd() {
    setEditingId(null);
    setForm(emptyPayload);
    setFormError("");
    setFormErrors({});
  }

  function startEdit(report: WeatherReport) {
    setEditingId(report.id);
    setForm({
      city: report.city,
      country: report.country ?? "",
      temperature_c: report.temperature_c,
      condition: report.condition ?? "",
      humidity: report.humidity ?? "",
      wind_kph: report.wind_kph ?? "",
    });
    setFormError("");
    setFormErrors({});
  }

  function updateField(key: keyof ReportForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function numericPayload(payload: ReportForm): ReportPayload {
    const numberOrBlank = (value: number | ""): string => {
      if (value === "") return "";
      return Number.isFinite(Number(value)) ? String(Number(value)) : String(Number.NaN);
    };
    const wire: ReportPayload = {
      city: payload.city.trim(),
      country: payload.country.trim(),
      temperature_c: payload.temperature_c === ""
        ? NaN
        : numberOrBlank(payload.temperature_c),
      condition: payload.condition.trim(),
    };
    const humidity = numberOrBlank(payload.humidity);
    if (humidity !== "") wire.humidity = Number(humidity);
    const windKph = numberOrBlank(payload.wind_kph);
    if (windKph !== "") wire.wind_kph = Number(windKph);
    return wire;
  }

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    setFormBusy(true);
    setFormError("");
    setFormErrors({});
    try {
      const payload = numericPayload(form);
      if (editingId === null) await api.create(payload);
      else await api.update(editingId, payload);
      startAdd();
      await Promise.all([loadReports(), loadRecent()]);
      if (searchedCity) void doSearch(searchedCity);
    } catch (err) {
      setFormError(errorText(err));
      setFormErrors(fieldErrors(err));
    } finally {
      setFormBusy(false);
    }
  }

  async function removeReport(report: WeatherReport) {
    if (!window.confirm(`Delete the weather report for ${report.city}?`)) return;
    setReportsError("");
    try {
      await api.remove(report.id);
      if (editingId === report.id) startAdd();
      await loadReports();
      if (searchedCity) void doSearch(searchedCity);
    } catch (err) {
      setReportsError(errorText(err));
    }
  }

  const formFields: {
    key: keyof ReportForm;
    label: string;
    type?: string;
    placeholder?: string;
    required?: boolean;
  }[] = [
    { key: "city", label: "City", placeholder: "e.g. Berlin", required: true },
    { key: "country", label: "Country", placeholder: "e.g. Germany" },
    { key: "temperature_c", label: "Temperature (°C)", type: "number", placeholder: "e.g. 18.5", required: true },
    { key: "condition", label: "Condition", placeholder: "e.g. Sunny" },
    { key: "humidity", label: "Humidity (%)", type: "number", placeholder: "0–100" },
    { key: "wind_kph", label: "Wind (kph)", type: "number", placeholder: "e.g. 12" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-slate-50 to-indigo-50 text-slate-800">
      <header className="border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-xl text-white shadow-md">☀</span>
            <div>
              <h1 className="text-lg font-bold leading-tight text-slate-900">Weather Watch</h1>
              <p className="text-xs text-slate-500">Current conditions, kept by the community</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm">
              {(["C", "F"] as Unit[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setUnit(option)}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                    unit === option
                      ? "bg-sky-600 text-white shadow"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                  aria-pressed={unit === option}
                >
                  °{option}
                </button>
              ))}
            </div>
            {token ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600">
                  Signed in as <strong className="font-semibold text-slate-900">{username}</strong>
                </span>
                <button type="button" onClick={signOut} className={secondaryBtn}>
                  Sign out
                </button>
              </div>
            ) : (
              <span className="text-sm text-slate-500">Not signed in</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-5 py-8 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-white bg-white/90 p-6 shadow-lg shadow-slate-200/50">
            <h2 className="mb-4 text-base font-bold text-slate-900">Look up a city</h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void doSearch(query);
              }}
              className="flex flex-col gap-3 sm:flex-row"
            >
              <input
                className={inputClass}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Enter a city name…"
                aria-label="City name"
              />
              <button type="submit" disabled={searchBusy || !query.trim()} className={primaryBtn}>
                {searchBusy ? "Searching…" : "Search"}
              </button>
            </form>

            {searchError && (
              <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{searchError}</p>
            )}

            {searchedCity && !searchBusy && !searchError && (
              result ? (
                <div className="mt-5 rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-600 p-6 text-white shadow-lg">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-bold">{result.city}</h3>
                      <p className="text-sm text-sky-100">{result.country || "Country unknown"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-4xl font-bold tracking-tight">{displayTemp(result.temperature_c, unit)}</p>
                      <p className="text-sm text-sky-100">{result.condition || "Condition unknown"}</p>
                    </div>
                  </div>
                  <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/20 pt-4 sm:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-sky-200">Humidity</p>
                      <p className="text-sm font-semibold">{result.humidity !== null ? `${result.humidity}%` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-sky-200">Wind</p>
                      <p className="text-sm font-semibold">{result.wind_kph !== null ? `${result.wind_kph} kph` : "—"}</p>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <p className="text-xs uppercase tracking-wide text-sky-200">Observed</p>
                      <p className="text-sm font-semibold">{formatTime(result.observed_at)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                  No weather data for {searchedCity}
                </p>
              )
            )}
          </div>

          {token && (
            <div className="rounded-2xl border border-white bg-white/90 p-6 shadow-lg shadow-slate-200/50">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900">Manage reports</h2>
                <button type="button" onClick={startAdd} className={secondaryBtn}>
                  + Add report
                </button>
              </div>

              {reportsError && (
                <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{reportsError}</p>
              )}

              {reportsBusy ? (
                <p className="text-sm text-slate-500">Loading reports…</p>
              ) : reports.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                  No reports yet. Add one below.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">City</th>
                        <th className="px-4 py-3">Country</th>
                        <th className="px-4 py-3">Temp</th>
                        <th className="px-4 py-3">Condition</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reports.map((report) => (
                        <tr key={report.id} className={editingId === report.id ? "bg-sky-50" : "hover:bg-slate-50"}>
                          <td className="px-4 py-3 font-semibold text-slate-800">{report.city}</td>
                          <td className="px-4 py-3 text-slate-600">{report.country || "—"}</td>
                          <td className="px-4 py-3 text-slate-600">{displayTemp(report.temperature_c, unit)}</td>
                          <td className="px-4 py-3 text-slate-600">{report.condition || "—"}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <button type="button" onClick={() => startEdit(report)} className={secondaryBtn}>
                                Edit
                              </button>
                              <button type="button" onClick={() => void removeReport(report)} className={dangerBtn}>
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <form onSubmit={submitForm} className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="mb-4 text-sm font-bold text-slate-800">
                  {editingId === null ? "Add a new report" : `Editing report #${editingId}`}
                </h3>
                {formError && (
                  <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  {formFields.map((field) => (
                    <div key={field.key}>
                      <label className={labelClass} htmlFor={`field-${field.key}`}>
                        {field.label}{field.required ? " *" : ""}
                      </label>
                      <input
                        id={`field-${field.key}`}
                        className={inputClass}
                        type={field.type || "text"}
                        step={field.type === "number" ? "any" : undefined}
                        value={form[field.key]}
                        placeholder={field.placeholder}
                        onChange={(event) => updateField(field.key, event.target.value)}
                      />
                      {formErrors[field.key] && (
                        <p className="mt-1 text-xs font-medium text-rose-600">{formErrors[field.key]}</p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-500">Leave optional fields blank to clear them. The observed time is set by the server.</p>
                <div className="mt-4 flex gap-2">
                  <button type="submit" disabled={formBusy} className={primaryBtn}>
                    {formBusy ? "Saving…" : editingId === null ? "Create report" : "Save changes"}
                  </button>
                  {editingId !== null && (
                    <button type="button" onClick={startAdd} className={secondaryBtn}>
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-white bg-white/90 p-6 shadow-lg shadow-slate-200/50">
            <h2 className="mb-4 text-base font-bold text-slate-900">Recent lookups</h2>
            {recent.length === 0 ? (
              <p className="text-sm text-slate-500">No lookups yet. Search for a city to get started.</p>
            ) : (
              <ul className="space-y-2">
                {recent.map((lookup) => (
                  <li key={lookup.id}>
                    <button
                      type="button"
                      onClick={() => void doSearch(lookup.city)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left text-sm transition hover:border-sky-300 hover:bg-sky-50"
                    >
                      <span className="font-semibold text-slate-800">{lookup.city}</span>
                      <span className={`text-xs font-medium ${lookup.found ? "text-emerald-600" : "text-slate-400"}`}>
                        {lookup.found ? "found" : "no data"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!token && (
            <div className="rounded-2xl border border-white bg-white/90 p-6 shadow-lg shadow-slate-200/50">
              <div className="mb-4 flex rounded-lg bg-slate-100 p-1">
                {(["login", "register"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setAuthMode(mode);
                      setAuthError("");
                      setAuthFieldErrors({});
                    }}
                    className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
                      authMode === mode ? "bg-white text-sky-700 shadow" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {mode === "login" ? "Sign in" : "Register"}
                  </button>
                ))}
              </div>
              <form onSubmit={submitAuth} className="space-y-4">
                {authError && (
                  <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{authError}</p>
                )}
                <div>
                  <label className={labelClass} htmlFor="auth-username">Username</label>
                  <input
                    id="auth-username"
                    className={inputClass}
                    value={authUsername}
                    onChange={(event) => setAuthUsername(event.target.value)}
                    autoComplete="username"
                    placeholder="Your username"
                  />
                  {authFieldErrors.username && (
                    <p className="mt-1 text-xs font-medium text-rose-600">{authFieldErrors.username}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass} htmlFor="auth-password">Password</label>
                  <input
                    id="auth-password"
                    className={inputClass}
                    type="password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    autoComplete={authMode === "login" ? "current-password" : "new-password"}
                    placeholder="Your password"
                  />
                  {authFieldErrors.password && (
                    <p className="mt-1 text-xs font-medium text-rose-600">{authFieldErrors.password}</p>
                  )}
                </div>
                <button type="submit" disabled={authBusy} className={`${primaryBtn} w-full`}>
                  {authBusy ? "Please wait…" : authMode === "login" ? "Sign in" : "Create account"}
                </button>
              </form>
              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                Anyone can look up the weather. Sign in to add, edit and delete reports.
              </p>
            </div>
          )}
        </aside>
      </main>

      <footer className="border-t border-white/60 py-6 text-center text-xs text-slate-400">
        Weather Watch · all reports are stored locally · temperatures in °{unit}
      </footer>
    </div>
  );
}
