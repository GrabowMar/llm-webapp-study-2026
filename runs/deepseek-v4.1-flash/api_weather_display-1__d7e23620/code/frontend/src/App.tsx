import { useEffect, useState } from "react";
import type { FormEvent } from "react";

type Report = {
  id: number;
  city: string;
  country: string | null;
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

type FormErrors = Record<string, string[]>;
type FormValues = {
  city: string;
  country: string;
  temperature_c: string;
  condition: string;
  humidity: string;
  wind_kph: string;
};
type SubmitResult = { error?: string; errors?: FormErrors } | null;
type Unit = "C" | "F";

const TOKEN_KEY = "weather_token";
const USER_KEY = "weather_user";

const emptyForm: FormValues = {
  city: "",
  country: "",
  temperature_c: "",
  condition: "",
  humidity: "",
  wind_kph: "",
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200";
const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600";
const primaryButton =
  "inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

async function request(
  path: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: any }> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    return { ok: false, status: 0, data: { error: "Could not reach the server." } };
  }

  let data: any = null;
  if (response.status !== 204) {
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }
    }
  }
  return { ok: response.ok, status: response.status, data };
}

function formatTemp(c: number | null | undefined, unit: Unit): string {
  if (c === null || c === undefined) return "—";
  const value = unit === "F" ? (c * 9) / 5 + 32 : c;
  return `${Math.round(value * 10) / 10} °${unit}`;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function buildPayload(values: FormValues): Record<string, unknown> {
  const numeric = (raw: string): number | string | null => {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : trimmed;
  };
  const text = (raw: string): string | null => {
    const trimmed = raw.trim();
    return trimmed === "" ? null : trimmed;
  };
  return {
    city: values.city.trim(),
    country: text(values.country),
    temperature_c: numeric(values.temperature_c),
    condition: text(values.condition),
    humidity: numeric(values.humidity),
    wind_kph: numeric(values.wind_kph),
  };
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return <p className="mt-1 text-xs font-medium text-red-600">{messages.join(" ")}</p>;
}

function ReportForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: FormValues;
  submitLabel: string;
  onSubmit: (payload: Record<string, unknown>) => Promise<SubmitResult>;
}) {
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<FormErrors>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setGeneral(null);
    const result = await onSubmit(buildPayload(values));
    if (result) {
      setErrors(result.errors ?? {});
      setGeneral(result.error ?? "Could not save the report.");
    } else {
      setValues(emptyForm);
    }
    setBusy(false);
  }

  const fields: { key: keyof FormValues; label: string; type?: string; placeholder?: string }[] = [
    { key: "city", label: "City", placeholder: "e.g. Berlin" },
    { key: "country", label: "Country", placeholder: "e.g. Germany" },
    { key: "temperature_c", label: "Temperature (°C)", type: "number", placeholder: "e.g. 18.5" },
    { key: "condition", label: "Condition", placeholder: "e.g. Partly cloudy" },
    { key: "humidity", label: "Humidity (%)", type: "number", placeholder: "0 – 100" },
    { key: "wind_kph", label: "Wind (km/h)", type: "number", placeholder: "e.g. 12" },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {general && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {general}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.key}>
            <label className={labelClass} htmlFor={`report-${field.key}`}>
              {field.label}
            </label>
            <input
              id={`report-${field.key}`}
              className={inputClass}
              type={field.type ?? "text"}
              step={field.type === "number" ? "any" : undefined}
              placeholder={field.placeholder}
              value={values[field.key]}
              onChange={(event) => update(field.key, event.target.value)}
            />
            <FieldError messages={errors[field.key]} />
          </div>
        ))}
      </div>
      <button type="submit" className={primaryButton} disabled={busy}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

export default function App() {
  const [token, setToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [username, setUsername] = useState<string>(() => localStorage.getItem(USER_KEY) ?? "");
  const [unit, setUnit] = useState<Unit>("C");

  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [result, setResult] = useState<Report | null>(null);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const [lookups, setLookups] = useState<Lookup[]>([]);

  const [reports, setReports] = useState<Report[]>([]);
  const [reportsTotal, setReportsTotal] = useState(0);
  const [reportsPage, setReportsPage] = useState(1);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [addKey, setAddKey] = useState(0);
  const [editing, setEditing] = useState<Report | null>(null);

  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({ username: "", password: "" });
  const [authErrors, setAuthErrors] = useState<FormErrors>({});
  const [authGeneral, setAuthGeneral] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const signedIn = token !== "";
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(reportsTotal / pageSize));

  function applySession(nextToken: string, nextUsername: string) {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, nextUsername);
    setToken(nextToken);
    setUsername(nextUsername);
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken("");
    setUsername("");
    setReports([]);
    setReportsTotal(0);
    setEditing(null);
  }

  async function loadRecent() {
    const response = await request("/api/weather/recent?limit=5");
    if (response.ok && response.data) setLookups(response.data.items ?? []);
  }

  useEffect(() => {
    loadRecent();
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setReports([]);
      setReportsTotal(0);
      return;
    }
    let cancelled = false;
    (async () => {
      setReportsLoading(true);
      setReportsError(null);
      const response = await request(
        `/api/weather?page=${reportsPage}&page_size=${pageSize}`,
      );
      if (cancelled) return;
      if (!response.ok) {
        if (response.status === 401) {
          signOut();
        } else {
          setReportsError(response.data?.error ?? "Could not load reports.");
        }
      } else if (response.data) {
        setReports(response.data.items ?? []);
        setReportsTotal(response.data.total ?? 0);
      }
      setReportsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, reportsPage, refreshKey]);

  function refreshReports() {
    setRefreshKey((key) => key + 1);
  }

  async function runSearch(city: string) {
    const term = city.trim();
    if (!term) {
      setSearchError("Enter a city name.");
      return;
    }
    setQuery(term);
    setSearchTerm(term);
    setSearchError(null);
    setSearching(true);
    const response = await request(`/api/weather?city=${encodeURIComponent(term)}`);
    setSearching(false);
    if (!response.ok) {
      setSearchError(response.data?.error ?? "Lookup failed.");
      setResult(null);
      setSearched(false);
      return;
    }
    const item: Report | null = response.data?.items?.[0] ?? null;
    setResult(item);
    setSearched(true);
    loadRecent();
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    await runSearch(query);
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthErrors({});
    setAuthGeneral(null);

    const path = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const response = await request(path, {
      method: "POST",
      body: JSON.stringify(authForm),
    });

    if (!response.ok) {
      setAuthErrors(response.data?.errors ?? {});
      setAuthGeneral(response.data?.error ?? "Request failed.");
      setAuthBusy(false);
      return;
    }

    if (authMode === "register") {
      const login = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(authForm),
      });
      if (!login.ok || !login.data?.token) {
        setAuthGeneral(login.data?.error ?? "Account created. Please sign in.");
        setAuthMode("login");
        setAuthBusy(false);
        return;
      }
      applySession(login.data.token, login.data.username ?? authForm.username);
    } else {
      applySession(response.data.token, response.data.username ?? authForm.username);
    }

    setAuthForm({ username: "", password: "" });
    setAuthBusy(false);
    setReportsPage(1);
    refreshReports();
  }

  async function createReport(payload: Record<string, unknown>): Promise<SubmitResult> {
    const response = await request("/api/weather", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      if (response.status === 401) signOut();
      return {
        error: response.data?.error ?? "Could not save the report.",
        errors: response.data?.errors,
      };
    }
    setAddKey((key) => key + 1);
    setReportsPage(1);
    refreshReports();
    return null;
  }

  async function updateReport(
    report: Report,
    payload: Record<string, unknown>,
  ): Promise<SubmitResult> {
    const response = await request(`/api/weather/${report.id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      if (response.status === 401) signOut();
      return {
        error: response.data?.error ?? "Could not save the report.",
        errors: response.data?.errors,
      };
    }
    setEditing(null);
    refreshReports();
    return null;
  }

  async function deleteReport(report: Report) {
    if (!window.confirm(`Delete the weather report for ${report.city}?`)) return;
    const response = await request(`/api/weather/${report.id}`, { method: "DELETE" });
    if (!response.ok) {
      if (response.status === 401) signOut();
      else setReportsError(response.data?.error ?? "Could not delete the report.");
      return;
    }
    if (reports.length === 1 && reportsPage > 1) {
      setReportsPage((page) => page - 1);
    } else {
      refreshReports();
    }
  }

  const toForm = (report: Report): FormValues => ({
    city: report.city,
    country: report.country ?? "",
    temperature_c: report.temperature_c?.toString() ?? "",
    condition: report.condition ?? "",
    humidity: report.humidity?.toString() ?? "",
    wind_kph: report.wind_kph?.toString() ?? "",
  });

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-900 text-white shadow">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold">Weather Display</h1>
            <p className="text-sm text-slate-300">
              Current conditions from the local weather store
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {signedIn ? (
              <>
                <span>
                  Signed in as <span className="font-semibold">{username}</span>
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 font-medium text-slate-100 transition hover:bg-slate-800"
                >
                  Sign out
                </button>
              </>
            ) : (
              <span className="text-slate-300">Browsing as guest</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">City search</h2>
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm">
                {(["C", "F"] as Unit[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setUnit(option)}
                    className={`px-3 py-1.5 font-semibold transition ${
                      unit === option
                        ? "bg-sky-600 text-white"
                        : "bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    °{option}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row">
              <input
                className={inputClass}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search for a city"
                aria-label="City"
              />
              <button type="submit" className={primaryButton} disabled={searching}>
                {searching ? "Searching…" : "Search"}
              </button>
            </form>

            {searchError && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {searchError}
              </p>
            )}

            {searched && result && (
              <div className="mt-5 overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 p-6 text-white shadow-lg">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-bold">{result.city}</h3>
                    <p className="text-sky-100">{result.country ?? "Unknown country"}</p>
                    <p className="mt-2 text-sky-50">{result.condition ?? "No condition reported"}</p>
                  </div>
                  <p className="text-5xl font-bold tabular-nums">
                    {formatTemp(result.temperature_c, unit)}
                  </p>
                </div>
                <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-white/20 pt-4 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-sky-100">Humidity</dt>
                    <dd className="font-semibold">
                      {result.humidity === null ? "—" : `${result.humidity}%`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sky-100">Wind</dt>
                    <dd className="font-semibold">
                      {result.wind_kph === null ? "—" : `${result.wind_kph} km/h`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sky-100">Observed</dt>
                    <dd className="font-semibold">{formatTime(result.observed_at)}</dd>
                  </div>
                </dl>
              </div>
            )}

            {searched && !result && (
              <p className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-slate-600">
                No weather data for {searchTerm}
              </p>
            )}
          </section>

          {signedIn ? (
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Manage reports</h2>
                {editing && (
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => setEditing(null)}
                  >
                    Cancel edit
                  </button>
                )}
              </div>

              {reportsError && (
                <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {reportsError}
                </p>
              )}

              <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
                  {editing ? `Edit report for ${editing.city}` : "Add a report"}
                </h3>
                {editing ? (
                  <ReportForm
                    key={`edit-${editing.id}`}
                    initial={toForm(editing)}
                    submitLabel="Update report"
                    onSubmit={(payload) => updateReport(editing, payload)}
                  />
                ) : (
                  <ReportForm
                    key={`add-${addKey}`}
                    initial={emptyForm}
                    submitLabel="Add report"
                    onSubmit={createReport}
                  />
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3 font-semibold">City</th>
                      <th className="py-2 pr-3 font-semibold">Country</th>
                      <th className="py-2 pr-3 font-semibold">Temp</th>
                      <th className="py-2 pr-3 font-semibold">Condition</th>
                      <th className="py-2 pr-3 font-semibold">Humidity</th>
                      <th className="py-2 pr-3 font-semibold">Wind</th>
                      <th className="py-2 pr-3 font-semibold">Observed</th>
                      <th className="py-2 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reports.map((report) => (
                      <tr key={report.id} className="align-top">
                        <td className="py-3 pr-3 font-medium">{report.city}</td>
                        <td className="py-3 pr-3 text-slate-600">{report.country ?? "—"}</td>
                        <td className="py-3 pr-3 tabular-nums">
                          {formatTemp(report.temperature_c, unit)}
                        </td>
                        <td className="py-3 pr-3 text-slate-600">{report.condition ?? "—"}</td>
                        <td className="py-3 pr-3 text-slate-600">
                          {report.humidity === null ? "—" : `${report.humidity}%`}
                        </td>
                        <td className="py-3 pr-3 text-slate-600">
                          {report.wind_kph === null ? "—" : `${report.wind_kph} km/h`}
                        </td>
                        <td className="py-3 pr-3 text-slate-600">
                          {formatTime(report.observed_at)}
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              onClick={() => setEditing(report)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                              onClick={() => deleteReport(report)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {reports.length === 0 && !reportsLoading && (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-slate-500">
                          No reports yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                <span>
                  {reportsLoading
                    ? "Loading…"
                    : `Page ${reportsPage} of ${totalPages} · ${reportsTotal} report${
                        reportsTotal === 1 ? "" : "s"
                      }`}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={secondaryButton}
                    disabled={reportsPage <= 1 || reportsLoading}
                    onClick={() => setReportsPage((page) => Math.max(1, page - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className={secondaryButton}
                    disabled={reportsPage >= totalPages || reportsLoading}
                    onClick={() => setReportsPage((page) => page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-slate-600">
              Sign in to add, edit, and delete weather reports.
            </section>
          )}
        </div>

        <aside className="space-y-6">
          {!signedIn && (
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="mb-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthErrors({});
                    setAuthGeneral(null);
                  }}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    authMode === "login"
                      ? "bg-sky-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("register");
                    setAuthErrors({});
                    setAuthGeneral(null);
                  }}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    authMode === "register"
                      ? "bg-sky-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Create account
                </button>
              </div>

              <form onSubmit={submitAuth} className="space-y-4" noValidate>
                {authGeneral && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {authGeneral}
                  </div>
                )}
                <div>
                  <label className={labelClass} htmlFor="auth-username">
                    Username
                  </label>
                  <input
                    id="auth-username"
                    className={inputClass}
                    value={authForm.username}
                    autoComplete="username"
                    onChange={(event) =>
                      setAuthForm((form) => ({ ...form, username: event.target.value }))
                    }
                  />
                  <FieldError messages={authErrors.username} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="auth-password">
                    Password
                  </label>
                  <input
                    id="auth-password"
                    className={inputClass}
                    type="password"
                    value={authForm.password}
                    autoComplete={authMode === "login" ? "current-password" : "new-password"}
                    onChange={(event) =>
                      setAuthForm((form) => ({ ...form, password: event.target.value }))
                    }
                  />
                  <FieldError messages={authErrors.password} />
                </div>
                <button type="submit" className={`${primaryButton} w-full`} disabled={authBusy}>
                  {authBusy
                    ? "Please wait…"
                    : authMode === "login"
                      ? "Sign in"
                      : "Create account"}
                </button>
              </form>
            </section>
          )}

          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 text-lg font-semibold">Recent lookups</h2>
            {lookups.length === 0 ? (
              <p className="text-sm text-slate-500">No lookups yet.</p>
            ) : (
              <ul className="space-y-2">
                {lookups.map((lookup) => (
                  <li key={lookup.id}>
                    <button
                      type="button"
                      onClick={() => runSearch(lookup.city)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm transition hover:border-sky-300 hover:bg-sky-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-800">
                          {lookup.city}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {formatTime(lookup.looked_up_at)}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          lookup.found
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {lookup.found ? "found" : "miss"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}
