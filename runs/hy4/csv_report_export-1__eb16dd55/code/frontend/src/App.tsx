import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Api,
  ApiRequestError,
  authRequest,
  emptyFilters,
  filterParams,
  today,
  type Entry,
  type Filters,
} from "./api";

const PAGE_SIZE = 10;
const TOKEN_KEY = "timesheet.token";
const USER_KEY = "timesheet.username";

type AuthMode = "login" | "register";

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
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100";

function AuthScreen({ onSignedIn }: { onSignedIn: (token: string, username: string) => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      if (mode === "register") {
        const data = (await authRequest("/api/auth/register", username, password)) as {
          username: string;
        };
        const login = await authRequest("/api/auth/login", username, password);
        if (login.token) onSignedIn(login.token, data.username);
      } else {
        const login = await authRequest("/api/auth/login", username, password);
        if (login.token) onSignedIn(login.token, username.trim());
      }
    } catch (error) {
      const data = error instanceof ApiRequestError ? error.data : undefined;
      setErrors(data?.errors ?? { general: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Timesheet</h1>
        <p className="mt-1 text-sm text-slate-500">Track your hours, project by project.</p>

        <div className="mt-6 flex rounded-lg bg-slate-100 p-1">
          {(["login", "register"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                setErrors({});
              }}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                mode === value
                  ? "bg-white text-indigo-700 shadow"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {value === "login" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Username" error={errors.username}>
            <input
              className={inputClass}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Password" error={errors.password}>
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </Field>
          {errors.general && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {errors.general}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

function QuickEntryForm({
  api,
  projects,
  onCreated,
}: {
  api: Api;
  projects: string[];
  onCreated: () => void;
}) {
  const [project, setProject] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(today());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api.createEntry({ project, description, hours, date });
      setProject("");
      setDescription("");
      setHours("");
      setDate(today());
      onCreated();
    } catch (error) {
      const data = error instanceof ApiRequestError ? error.data : undefined;
      setErrors(data?.errors ?? { general: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold text-slate-900">Log time</h2>
      <form
        id="quick-entry"
        onSubmit={submit}
        className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <Field label="Project" error={errors.project}>
          <input
            className={inputClass}
            list="project-suggestions"
            value={project}
            onChange={(event) => setProject(event.target.value)}
            placeholder="e.g. Website redesign"
            required
          />
          <datalist id="project-suggestions">
            {projects.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>
        <Field label="Description" error={errors.description}>
          <input
            className={inputClass}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What did you work on?"
          />
        </Field>
        <Field label="Hours" error={errors.hours}>
          <input
            className={inputClass}
            type="number"
            min="0"
            step="any"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            placeholder="1.5"
            required
          />
        </Field>
        <Field label="Date" error={errors.date}>
          <input
            className={inputClass}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </Field>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Add entry"}
          </button>
        </div>
      </form>
      {errors.general && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errors.general}
        </p>
      )}
    </section>
  );
}

function EditableRow({
  entry,
  api,
  onSaved,
  onDeleted,
}: {
  entry: Entry;
  api: Api;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [project, setProject] = useState(entry.project);
  const [description, setDescription] = useState(entry.description);
  const [hours, setHours] = useState(String(entry.hours));
  const [date, setDate] = useState(entry.date);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function startEditing() {
    setProject(entry.project);
    setDescription(entry.description);
    setHours(String(entry.hours));
    setDate(entry.date);
    setError("");
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api.updateEntry(entry.id, {
        project,
        description,
        hours: Number(hours),
        date,
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete this entry for "${entry.project}"?`)) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteEntry(entry.id);
      onDeleted();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <tr className="bg-indigo-50/60">
        <td className="px-3 py-2 align-top">
          <input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </td>
        <td className="px-3 py-2 align-top">
          <input className={inputClass} value={project} onChange={(e) => setProject(e.target.value)} />
        </td>
        <td className="px-3 py-2 align-top">
          <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
        </td>
        <td className="px-3 py-2 align-top">
          <input className={inputClass} type="number" min="0" step="any" value={hours} onChange={(e) => setHours(e.target.value)} />
        </td>
        <td className="px-3 py-2 align-top">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              Save
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(false)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50">
      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{entry.date}</td>
      <td className="px-3 py-2 font-medium text-slate-900">{entry.project}</td>
      <td className="px-3 py-2 text-slate-600">{entry.description || "—"}</td>
      <td className="px-3 py-2 tabular-nums text-slate-900">{entry.hours}</td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={startEditing}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            Delete
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [username, setUsername] = useState(() => localStorage.getItem(USER_KEY) ?? "");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [projects, setProjects] = useState<string[]>([]);
  const [summary, setSummary] = useState<{ project: string; hours: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken("");
    setUsername("");
  }, []);

  const api = useMemo(() => new Api(token, signOut), [token, signOut]);

  useEffect(() => {
    if (!token) return;
    api.projects()
      .then((data) => setProjects(data.items))
      .catch(() => undefined);
  }, [api, token]);

  const refresh = useCallback(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      api.entries(filters, page, PAGE_SIZE),
      api.summary(filters),
      api.projects(),
    ])
      .then(([entries, totals, projectList]) => {
        setItems(entries.items);
        setTotal(entries.total);
        setSummary(totals.items);
        setProjects(projectList.items);
        setError("");
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [api, filters, page, token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function signedIn(newToken: string, name: string) {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, name);
    setToken(newToken);
    setUsername(name);
    setPage(1);
    setFilters(emptyFilters);
  }

  async function signOutAndRevoke() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } finally {
      signOut();
    }
  }

  async function exportCsv(kind: "entries.csv" | "summary.csv") {
    const query = filterParams(filters);
    try {
      await api.download(`/api/exports/${kind}?${query}`, kind);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!token) {
    return <AuthScreen onSignedIn={signedIn} />;
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const grandTotal = summary.reduce((sum, row) => sum + row.hours, 0);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Timesheet</h1>
            <p className="text-sm text-slate-500">
              Signed in as <span className="font-medium text-slate-700">{username}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={signOutAndRevoke}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <QuickEntryForm api={api} projects={projects} onCreated={() => { setPage(1); refresh(); }} />

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Entries</h2>
              <p className="text-sm text-slate-500">Filter by period and project.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => exportCsv("entries.csv")}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => exportCsv("summary.csv")}
                className="rounded-lg border border-emerald-600 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm hover:bg-emerald-50"
              >
                Export totals
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="From">
              <input
                className={inputClass}
                type="date"
                value={filters.start_date}
                onChange={(e) => { setFilters({ ...filters, start_date: e.target.value }); setPage(1); }}
              />
            </Field>
            <Field label="To">
              <input
                className={inputClass}
                type="date"
                value={filters.end_date}
                onChange={(e) => { setFilters({ ...filters, end_date: e.target.value }); setPage(1); }}
              />
            </Field>
            <Field label="Project">
              <select
                className={inputClass}
                value={filters.project}
                onChange={(e) => { setFilters({ ...filters, project: e.target.value }); setPage(1); }}
              >
                <option value="">All projects</option>
                {projects.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </Field>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => { setFilters(emptyFilters); setPage(1); }}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Clear filters
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Totals per project</h2>
          {summary.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No hours logged for these filters yet.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-3">
              {summary.map((row) => (
                <div key={row.project} className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                  <div className="text-sm font-medium text-slate-700">{row.project}</div>
                  <div className="text-xl font-bold tabular-nums text-indigo-700">{row.hours} h</div>
                </div>
              ))}
              <div className="rounded-xl bg-indigo-50 px-4 py-3 ring-1 ring-indigo-200">
                <div className="text-sm font-medium text-indigo-700">Total</div>
                <div className="text-xl font-bold tabular-nums text-indigo-700">{grandTotal} h</div>
              </div>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Time entries <span className="text-sm font-normal text-slate-500">({total})</span>
            </h2>
            {loading && <span className="text-sm text-slate-500">Loading…</span>}
          </div>

          {error && (
            <p role="alert" className="mx-6 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {items.length === 0 && !loading ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">
              No entries found. Log your first one above.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Date</th>
                    <th className="px-3 py-3 font-semibold">Project</th>
                    <th className="px-3 py-3 font-semibold">Description</th>
                    <th className="px-3 py-3 font-semibold">Hours</th>
                    <th className="px-3 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((entry) => (
                    <EditableRow
                      key={entry.id}
                      entry={entry}
                      api={api}
                      onSaved={refresh}
                      onDeleted={refresh}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
            <span className="text-sm text-slate-500">
              Page {page} of {pageCount}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => setPage((value) => value + 1)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
