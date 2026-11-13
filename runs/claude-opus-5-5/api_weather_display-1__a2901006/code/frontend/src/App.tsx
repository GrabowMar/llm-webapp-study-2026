import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { api, ApiError } from "./api";
import type { Lookup, Page, ReportInput, WeatherReport } from "./api";

type Unit = "C" | "F";

const TOKEN_KEY = "weather.token";
const USER_KEY = "weather.username";
const UNIT_KEY = "weather.unit";
const PAGE_SIZE = 10;

function formatTemp(celsius: number, unit: Unit): string {
  const value = unit === "C" ? celsius : (celsius * 9) / 5 + 32;
  return `${Math.round(value * 10) / 10}°${unit}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200";
const primaryBtn =
  "rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50";
const dangerBtn =
  "rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-rose-700 disabled:opacity-50";

function Card({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Alert({ kind, children }: { kind: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-rose-200 bg-rose-50 text-rose-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    info: "border-slate-200 bg-slate-50 text-slate-700",
  }[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${styles}`}>
      {children}
    </div>
  );
}

function AuthPanel({ onSignedIn }: { onSignedIn: (token: string, username: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    setNotice(null);
    try {
      if (mode === "register") {
        await api.register(username, password);
        setNotice("Account created. You can sign in now.");
        setMode("login");
        setPassword("");
      } else {
        const res = await api.login(username, password);
        onSignedIn(res.token, res.username ?? username.trim());
      }
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
    } finally {
      setBusy(false);
    }
  };

  const tab = (m: "login" | "register", label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(m);
        setError(null);
        setFieldErrors({});
        setNotice(null);
      }}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
        mode === m ? "bg-white text-sky-700 shadow-sm" : "text-slate-600 hover:text-slate-800"
      }`}
    >
      {label}
    </button>
  );

  return (
    <Card title={mode === "login" ? "Sign in" : "Register"}>
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
        {tab("login", "Sign in")}
        {tab("register", "Register")}
      </div>
      <form onSubmit={submit} className="space-y-3" aria-label={mode === "login" ? "Sign in form" : "Registration form"}>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Username</span>
          <input
            name="username"
            className={inputClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
          {fieldErrors.username && <span className="mt-1 block text-xs text-rose-600">Username {fieldErrors.username}</span>}
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Password</span>
          <input
            name="password"
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
          {fieldErrors.password && <span className="mt-1 block text-xs text-rose-600">Password {fieldErrors.password}</span>}
        </label>
        {error && <Alert kind="error">{error}</Alert>}
        {notice && <Alert kind="success">{notice}</Alert>}
        <button type="submit" className={`${primaryBtn} w-full`} disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
    </Card>
  );
}

function UnitSwitch({ unit, onChange }: { unit: Unit; onChange: (u: Unit) => void }) {
  return (
    <div role="group" aria-label="Temperature unit" className="inline-flex rounded-lg bg-slate-100 p-1">
      {(["C", "F"] as Unit[]).map((u) => (
        <button
          key={u}
          type="button"
          aria-pressed={unit === u}
          onClick={() => onChange(u)}
          className={`rounded-md px-3 py-1 text-sm font-medium ${
            unit === u ? "bg-white text-sky-700 shadow-sm" : "text-slate-600 hover:text-slate-800"
          }`}
        >
          °{u}
        </button>
      ))}
    </div>
  );
}

function WeatherCard({ report, unit }: { report: WeatherReport; unit: Unit }) {
  const rows: [string, string][] = [
    ["Condition", report.condition ?? "—"],
    ["Humidity", report.humidity != null ? `${report.humidity}%` : "—"],
    ["Wind", report.wind_kph != null ? `${report.wind_kph} km/h` : "—"],
    ["Observed", formatTime(report.observed_at)],
  ];
  return (
    <article
      data-testid="weather-card"
      className="rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 p-6 text-white shadow-md"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold">{report.city}</h3>
          <p className="text-sky-100">{report.country ?? "Unknown country"}</p>
        </div>
        <p className="text-5xl font-light" data-testid="temperature">
          {formatTemp(report.temperature_c, unit)}
        </p>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wide text-sky-100">{label}</dt>
            <dd className="text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

type SearchResult = { kind: "found"; report: WeatherReport } | { kind: "missing"; city: string } | null;

function RecentLookups({ items, onPick }: { items: Lookup[]; onPick: (city: string) => void }) {
  return (
    <Card title="Recent lookups">
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No lookups yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => onPick(l.city)}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:border-sky-300 hover:bg-sky-50"
              >
                <span className="font-medium text-slate-800">{l.city}</span>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  <span
                    className={`rounded-full px-2 py-0.5 ${
                      l.found ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {l.found ? "found" : "no data"}
                  </span>
                  {formatTime(l.looked_up_at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

interface FormState {
  city: string;
  country: string;
  temperature_c: string;
  condition: string;
  humidity: string;
  wind_kph: string;
}

const emptyForm: FormState = { city: "", country: "", temperature_c: "", condition: "", humidity: "", wind_kph: "" };

function toForm(r: WeatherReport): FormState {
  return {
    city: r.city,
    country: r.country ?? "",
    temperature_c: String(r.temperature_c),
    condition: r.condition ?? "",
    humidity: r.humidity != null ? String(r.humidity) : "",
    wind_kph: r.wind_kph != null ? String(r.wind_kph) : "",
  };
}

function numOrRaw(v: string): number | string | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : t;
}

function toInput(f: FormState): ReportInput {
  return {
    city: f.city,
    country: f.country.trim() === "" ? null : f.country,
    temperature_c: numOrRaw(f.temperature_c),
    condition: f.condition.trim() === "" ? null : f.condition,
    humidity: numOrRaw(f.humidity),
    wind_kph: numOrRaw(f.wind_kph),
  };
}

const FIELDS: { key: keyof FormState; label: string; numeric?: boolean; required?: boolean }[] = [
  { key: "city", label: "City", required: true },
  { key: "country", label: "Country" },
  { key: "temperature_c", label: "Temperature (°C)", numeric: true, required: true },
  { key: "condition", label: "Condition" },
  { key: "humidity", label: "Humidity (%)", numeric: true },
  { key: "wind_kph", label: "Wind (km/h)", numeric: true },
];

function ReportForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: FormState;
  submitLabel: string;
  onSubmit: (input: ReportInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await onSubmit(toInput(form));
      setForm(initial);
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              {f.label}
              {f.required && <span className="text-rose-500"> *</span>}
            </span>
            <input
              name={f.key}
              className={`${inputClass} ${fieldErrors[f.key] ? "border-rose-400" : ""}`}
              inputMode={f.numeric ? "decimal" : undefined}
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              aria-invalid={Boolean(fieldErrors[f.key])}
            />
            {fieldErrors[f.key] && (
              <span className="mt-1 block text-xs text-rose-600">
                {f.label.replace(/ \(.*\)$/, "")} {fieldErrors[f.key]}
              </span>
            )}
          </label>
        ))}
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="flex gap-2">
        <button type="submit" className={primaryBtn} disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className={secondaryBtn} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function ReportsManager({
  token,
  unit,
  onAuthLost,
  onChanged,
}: {
  token: string;
  unit: Unit;
  onAuthLost: () => void;
  onChanged: (report: WeatherReport | null, deletedId?: number) => void;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<WeatherReport> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WeatherReport | null>(null);
  const [confirming, setConfirming] = useState<WeatherReport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    try {
      const res = await api.list(p, PAGE_SIZE);
      const lastPage = Math.max(1, Math.ceil(res.total / PAGE_SIZE));
      if (res.items.length === 0 && p > lastPage) {
        setPage(lastPage);
        return;
      }
      setData(res);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const guard = async <T,>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onAuthLost();
      throw err;
    }
  };

  const create = async (input: ReportInput) => {
    const created = await guard(() => api.create(token, input));
    setNotice(`Added report for ${created.city}.`);
    onChanged(created);
    await load(page);
  };

  const update = async (input: ReportInput) => {
    if (!editing) return;
    const updated = await guard(() => api.update(token, editing.id, input));
    setEditing(null);
    setNotice(`Updated report for ${updated.city}.`);
    onChanged(updated);
    await load(page);
  };

  const remove = async (r: WeatherReport) => {
    try {
      await guard(() => api.remove(token, r.id));
      setNotice(`Deleted report for ${r.city}.`);
      setConfirming(null);
      if (editing?.id === r.id) setEditing(null);
      onChanged(null, r.id);
      await load(page);
    } catch (err) {
      setConfirming(null);
      setError(errorMessage(err));
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="space-y-6">
      <Card title="Add a report">
        <ReportForm initial={emptyForm} submitLabel="Add report" onSubmit={create} />
      </Card>

      {editing && (
        <Card title={`Edit ${editing.city}`}>
          <ReportForm
            key={editing.id}
            initial={toForm(editing)}
            submitLabel="Save changes"
            onSubmit={update}
            onCancel={() => setEditing(null)}
          />
        </Card>
      )}

      <Card title="Weather reports" actions={data && <span className="text-sm text-slate-500">{data.total} total</span>}>
        {notice && (
          <div className="mb-3">
            <Alert kind="success">{notice}</Alert>
          </div>
        )}
        {error && (
          <div className="mb-3">
            <Alert kind="error">{error}</Alert>
          </div>
        )}
        {!data ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : data.items.length === 0 ? (
          <p className="text-sm text-slate-500">No reports yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">City</th>
                  <th className="py-2 pr-3">Country</th>
                  <th className="py-2 pr-3">Temp</th>
                  <th className="py-2 pr-3">Condition</th>
                  <th className="py-2 pr-3">Humidity</th>
                  <th className="py-2 pr-3">Wind</th>
                  <th className="py-2 pr-3">Observed</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((r) => (
                  <tr key={r.id} className="align-middle">
                    <td className="py-2 pr-3 font-medium text-slate-800">{r.city}</td>
                    <td className="py-2 pr-3 text-slate-600">{r.country ?? "—"}</td>
                    <td className="py-2 pr-3 text-slate-600">{formatTemp(r.temperature_c, unit)}</td>
                    <td className="py-2 pr-3 text-slate-600">{r.condition ?? "—"}</td>
                    <td className="py-2 pr-3 text-slate-600">{r.humidity != null ? `${r.humidity}%` : "—"}</td>
                    <td className="py-2 pr-3 text-slate-600">{r.wind_kph != null ? `${r.wind_kph} km/h` : "—"}</td>
                    <td className="py-2 pr-3 text-xs text-slate-500">{formatTime(r.observed_at)}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {confirming?.id === r.id ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-xs text-slate-600">Delete {r.city}?</span>
                          <button type="button" className={dangerBtn} onClick={() => void remove(r)}>
                            Confirm
                          </button>
                          <button
                            type="button"
                            className="rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                            onClick={() => setConfirming(null)}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex gap-2">
                          <button
                            type="button"
                            className="rounded-md px-2 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-50"
                            onClick={() => {
                              setNotice(null);
                              setEditing(r);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="rounded-md px-2 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
                            onClick={() => {
                              setNotice(null);
                              setConfirming(r);
                            }}
                          >
                            Delete
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <button type="button" className={secondaryBtn} disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span className="text-slate-600">
              Page {data.page} of {totalPages}
            </span>
            <button
              type="button"
              className={secondaryBtn}
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem(USER_KEY));
  const [unit, setUnit] = useState<Unit>(() => (localStorage.getItem(UNIT_KEY) === "F" ? "F" : "C"));
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Lookup[]>([]);

  const signOutLocal = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUsername(null);
  }, []);

  const loadRecent = useCallback(async () => {
    try {
      const res = await api.recent(5);
      setRecent(res.items);
    } catch {
      /* keep previous list */
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    if (!token) return;
    api
      .me(token)
      .then((u) => {
        setUsername(u.username);
        localStorage.setItem(USER_KEY, u.username);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) signOutLocal();
      });
  }, [token, signOutLocal]);

  const changeUnit = (u: Unit) => {
    setUnit(u);
    localStorage.setItem(UNIT_KEY, u);
  };

  const signIn = (t: string, name: string) => {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, name);
    setToken(t);
    setUsername(name);
  };

  const signOut = async () => {
    const t = token;
    signOutLocal();
    if (t) {
      try {
        await api.logout(t);
      } catch {
        /* token already invalid */
      }
    }
  };

  const search = async (city: string) => {
    const c = city.trim();
    if (!c) return;
    setQuery(c);
    setSearching(true);
    setSearchError(null);
    try {
      const res = await api.search(c);
      setResult(res.items.length > 0 ? { kind: "found", report: res.items[0] } : { kind: "missing", city: c });
    } catch (err) {
      setResult(null);
      setSearchError(errorMessage(err));
    } finally {
      setSearching(false);
      void loadRecent();
    }
  };

  const onReportChanged = (report: WeatherReport | null, deletedId?: number) => {
    setResult((prev) => {
      if (!prev || prev.kind !== "found") return prev;
      if (deletedId !== undefined && prev.report.id === deletedId) return { kind: "missing", city: prev.report.city };
      if (report && prev.report.id === report.id) return { kind: "found", report };
      return prev;
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <h1 className="text-xl font-bold text-sky-700">Weather Display</h1>
          <div className="flex items-center gap-4">
            <UnitSwitch unit={unit} onChange={changeUnit} />
            {token && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600">
                  Signed in as <strong data-testid="current-user" className="text-slate-900">{username}</strong>
                </span>
                <button type="button" className={secondaryBtn} onClick={() => void signOut()}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Current conditions">
            <form
              className="mb-4 flex gap-2"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                void search(query);
              }}
            >
              <input
                name="city"
                aria-label="City"
                placeholder="Search a city, e.g. London"
                className={inputClass}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" className={primaryBtn} disabled={searching || !query.trim()}>
                {searching ? "Searching…" : "Search"}
              </button>
            </form>
            {searchError && <Alert kind="error">{searchError}</Alert>}
            {result?.kind === "found" && <WeatherCard report={result.report} unit={unit} />}
            {result?.kind === "missing" && <Alert kind="info">No weather data for {result.city}</Alert>}
            {!result && !searchError && (
              <p className="text-sm text-slate-500">Search for a city to see its current weather.</p>
            )}
          </Card>

          {token && (
            <ReportsManager token={token} unit={unit} onAuthLost={signOutLocal} onChanged={onReportChanged} />
          )}
        </div>

        <div className="space-y-6">
          {!token && <AuthPanel onSignedIn={signIn} />}
          <RecentLookups items={recent} onPick={(c) => void search(c)} />
        </div>
      </main>
    </div>
  );
}
