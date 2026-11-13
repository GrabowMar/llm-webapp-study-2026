import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, Lookup, Report, ReportInput, api, getToken, setToken } from "./api";

type Unit = "C" | "F";

const inputCls =
  "w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";
const btnCls =
  "rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50";
const btnSecCls =
  "rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100";

function formatTemp(c: number, unit: Unit): string {
  const v = unit === "C" ? c : (c * 9) / 5 + 32;
  return `${(Math.round(v * 10) / 10).toFixed(1)} °${unit}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {error && (
        <span role="alert" className="mt-1 block text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

function AuthPanel({ onSignedIn }: { onSignedIn: (username: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setMessage("");
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register(username, password);
      }
      const { token } = await api.login(username, password);
      setToken(token);
      onSignedIn((await api.me()).username);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        if (Object.keys(err.errors).length === 0) setMessage(err.message);
      } else {
        setMessage("Network error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg bg-white p-4 shadow" aria-label={mode}>
      <h2 className="text-lg font-semibold">{mode === "login" ? "Sign in" : "Register"}</h2>
      <Field label="Username" error={errors.username}>
        <input
          className={inputCls}
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </Field>
      <Field label="Password" error={errors.password}>
        <input
          className={inputCls}
          type="password"
          name="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {message && (
        <p role="alert" className="text-sm text-red-600">
          {message}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button className={btnCls} disabled={busy} type="submit">
          {mode === "login" ? "Sign in" : "Register"}
        </button>
        <button
          type="button"
          className="text-sm text-sky-700 underline"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setErrors({});
            setMessage("");
          }}
        >
          {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
        </button>
      </div>
    </form>
  );
}

function WeatherCard({ report, unit }: { report: Report; unit: Unit }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow" data-testid="weather-card">
      <h3 className="text-xl font-semibold">
        {report.city}
        {report.country ? <span className="text-slate-500">, {report.country}</span> : null}
      </h3>
      <p className="mt-2 text-4xl font-light">{formatTemp(report.temperature_c, unit)}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <dt className="text-slate-500">Condition</dt>
        <dd>{report.condition ?? "—"}</dd>
        <dt className="text-slate-500">Humidity</dt>
        <dd>{report.humidity === null ? "—" : `${report.humidity}%`}</dd>
        <dt className="text-slate-500">Wind</dt>
        <dd>{report.wind_kph === null ? "—" : `${report.wind_kph} km/h`}</dd>
        <dt className="text-slate-500">Observed</dt>
        <dd>{formatTime(report.observed_at)}</dd>
      </dl>
    </div>
  );
}

function SearchPanel({ unit }: { unit: Unit }) {
  const [city, setCity] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<Lookup[]>([]);

  const loadRecent = useCallback(async () => {
    try {
      setRecent((await api.recent(5)).items);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  async function search(name: string) {
    const q = name.trim();
    if (!q) return;
    setError("");
    try {
      const res = await api.search(q);
      if (res.items.length > 0) {
        setReport(res.items[0]);
        setMissing(null);
      } else {
        setReport(null);
        setMissing(q);
      }
    } catch (err) {
      setReport(null);
      setMissing(null);
      setError(err instanceof Error ? err.message : "Search failed");
    }
    loadRecent();
  }

  return (
    <section className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search(city);
        }}
      >
        <input
          className={inputCls}
          placeholder="Search a city"
          aria-label="City"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
        <button className={btnCls} type="submit">
          Search
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {report && <WeatherCard report={report} unit={unit} />}
      {missing !== null && (
        <p className="rounded-lg bg-amber-50 p-4 text-amber-800" data-testid="no-data">
          No weather data for {missing}
        </p>
      )}
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Recent lookups
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">No lookups yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2" data-testid="recent">
            {recent.map((l) => (
              <li key={l.id}>
                <button
                  className={`rounded-full border px-3 py-1 text-sm hover:bg-slate-100 ${
                    l.found ? "border-slate-300 bg-white" : "border-amber-300 bg-amber-50"
                  }`}
                  onClick={() => {
                    setCity(l.city);
                    search(l.city);
                  }}
                >
                  {l.city}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const emptyForm = { city: "", country: "", temperature_c: "", condition: "", humidity: "", wind_kph: "" };
type FormState = typeof emptyForm;

function toInput(f: FormState): ReportInput {
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const txt = (s: string) => (s.trim() === "" ? null : s);
  return {
    city: f.city,
    country: txt(f.country),
    temperature_c: num(f.temperature_c),
    condition: txt(f.condition),
    humidity: num(f.humidity),
    wind_kph: num(f.wind_kph),
  };
}

function ReportForm({
  initial,
  title,
  onSubmit,
  onCancel,
}: {
  initial: FormState;
  title: string;
  onSubmit: (input: ReportInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setMessage("");
    setBusy(true);
    try {
      await onSubmit(toInput(form));
      if (!onCancel) setForm(emptyForm);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        if (Object.keys(err.errors).length === 0) setMessage(err.message);
      } else {
        setMessage("Network error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-lg bg-white p-4 shadow" aria-label={title}>
      <h3 className="font-semibold">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="City" error={errors.city}>
          <input className={inputCls} name="city" value={form.city} onChange={set("city")} />
        </Field>
        <Field label="Country" error={errors.country}>
          <input className={inputCls} name="country" value={form.country} onChange={set("country")} />
        </Field>
        <Field label="Temperature (°C)" error={errors.temperature_c}>
          <input
            className={inputCls}
            name="temperature_c"
            inputMode="decimal"
            value={form.temperature_c}
            onChange={set("temperature_c")}
          />
        </Field>
        <Field label="Condition" error={errors.condition}>
          <input className={inputCls} name="condition" value={form.condition} onChange={set("condition")} />
        </Field>
        <Field label="Humidity (%)" error={errors.humidity}>
          <input
            className={inputCls}
            name="humidity"
            inputMode="decimal"
            value={form.humidity}
            onChange={set("humidity")}
          />
        </Field>
        <Field label="Wind (km/h)" error={errors.wind_kph}>
          <input
            className={inputCls}
            name="wind_kph"
            inputMode="decimal"
            value={form.wind_kph}
            onChange={set("wind_kph")}
          />
        </Field>
      </div>
      {message && (
        <p role="alert" className="text-sm text-red-600">
          {message}
        </p>
      )}
      <div className="flex gap-2">
        <button className={btnCls} disabled={busy} type="submit">
          Save
        </button>
        {onCancel && (
          <button type="button" className={btnSecCls} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

const PAGE_SIZE = 10;

function ReportsPanel({ unit, onUnauthorized }: { unit: Unit; onUnauthorized: () => void }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.list(page, PAGE_SIZE);
      const pages = Math.max(1, Math.ceil(res.total / PAGE_SIZE));
      if (page > pages) setPage(pages);
      setReports(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  function guard(err: unknown) {
    if (err instanceof ApiError && err.status === 401) onUnauthorized();
    throw err;
  }

  async function remove(r: Report) {
    if (!window.confirm(`Delete the report for ${r.city}?`)) return;
    try {
      await api.remove(r.id);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      else setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Manage reports</h2>
      <ReportForm
        title="Add report"
        initial={emptyForm}
        onSubmit={async (input) => {
          try {
            await api.create(input);
          } catch (e) {
            guard(e);
          }
          await load();
        }}
      />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <ul className="space-y-3">
        {reports.map((r) =>
          editing === r.id ? (
            <li key={r.id}>
              <ReportForm
                title={`Edit ${r.city}`}
                initial={{
                  city: r.city,
                  country: r.country ?? "",
                  temperature_c: String(r.temperature_c),
                  condition: r.condition ?? "",
                  humidity: r.humidity === null ? "" : String(r.humidity),
                  wind_kph: r.wind_kph === null ? "" : String(r.wind_kph),
                }}
                onCancel={() => setEditing(null)}
                onSubmit={async (input) => {
                  try {
                    await api.replace(r.id, input);
                  } catch (e) {
                    guard(e);
                  }
                  setEditing(null);
                  await load();
                }}
              />
            </li>
          ) : (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 shadow"
              data-testid="report-row"
            >
              <div className="text-sm">
                <span className="font-medium">{r.city}</span>
                {r.country ? `, ${r.country}` : ""} — {formatTemp(r.temperature_c, unit)}
                {r.condition ? `, ${r.condition}` : ""}
              </div>
              <div className="flex shrink-0 gap-2">
                <button className={btnSecCls} onClick={() => setEditing(r.id)}>
                  Edit
                </button>
                <button
                  className="rounded border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                  onClick={() => remove(r)}
                >
                  Delete
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
      <div className="flex items-center gap-3 text-sm">
        <button className={btnSecCls} disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button className={btnSecCls} disabled={page >= pages} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </section>
  );
}

export default function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [unit, setUnit] = useState<Unit>("C");

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    api
      .me()
      .then((u) => setUsername(u.username))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) setToken(null);
      })
      .finally(() => setReady(true));
  }, []);

  function signOut() {
    setToken(null);
    setUsername(null);
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-sky-700 text-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-xl font-semibold">Weather</h1>
          <div className="flex items-center gap-4">
            <div className="flex overflow-hidden rounded border border-sky-300" role="group" aria-label="Temperature unit">
              {(["C", "F"] as Unit[]).map((u) => (
                <button
                  key={u}
                  aria-pressed={unit === u}
                  onClick={() => setUnit(u)}
                  className={`px-3 py-1 text-sm ${unit === u ? "bg-white text-sky-800" : "hover:bg-sky-600"}`}
                >
                  °{u}
                </button>
              ))}
            </div>
            {username && (
              <div className="flex items-center gap-2 text-sm">
                <span data-testid="username">{username}</span>
                <button className="rounded border border-sky-300 px-3 py-1 hover:bg-sky-600" onClick={signOut}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-6">
        <SearchPanel unit={unit} />
        {ready && !username && <AuthPanel onSignedIn={setUsername} />}
        {username && <ReportsPanel unit={unit} onUnauthorized={signOut} />}
      </main>
    </div>
  );
}
