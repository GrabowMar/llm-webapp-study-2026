import { useEffect, useState } from "react";
import {
  clearSession,
  createEntry,
  deleteEntry,
  downloadCsv,
  fetchEntries,
  getUsername,
  login,
  register,
  updateEntry,
  type Entry,
  type EntryPage,
  type Filters,
} from "./api";

type Mode = "login" | "register";

function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

const inputCls =
  "rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "block text-sm font-medium text-slate-700 mb-1";
const btnPrimary =
  "rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";
const btnSecondary =
  "rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50";

export default function App() {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("timesheet_token"),
  );
  const [username, setUsername] = useState<string | null>(getUsername());

  if (!token) {
    return (
      <Auth
        onAuthed={(t, u) => {
          setToken(t);
          setUsername(u);
        }}
      />
    );
  }

  return (
    <Dashboard
      username={username ?? ""}
      onSignOut={() => {
        clearSession();
        setToken(null);
        setUsername(null);
      }}
    />
  );
}

function Auth({ onAuthed }: { onAuthed: (token: string, username: string) => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const res = await login(username, password);
        if (res.ok && res.token) {
          onAuthed(res.token, username);
          return;
        }
        setError(res.error ?? "Sign in failed");
      } else {
        const res = await register(username, password);
        if (!res.ok) {
          setError(res.error ?? "Registration failed");
          return;
        }
        const loginRes = await login(username, password);
        if (loginRes.ok && loginRes.token) {
          onAuthed(loginRes.token, username);
          return;
        }
        setError("Account created — please sign in");
        setMode("login");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <h1 className="mb-6 text-center text-2xl font-bold text-slate-800">
          Timesheet
        </h1>
        <div className="mb-6 flex rounded bg-slate-100 p-1">
          {(["login", "register"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`flex-1 rounded py-2 text-sm font-medium ${
                mode === m ? "bg-white text-slate-800 shadow" : "text-slate-500"
              }`}
            >
              {m === "login" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={labelCls} htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className={`${inputCls} w-full`}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className={`${inputCls} w-full`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
            {mode === "login" ? "Sign in" : "Register"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Dashboard({
  username,
  onSignOut,
}: {
  username: string;
  onSignOut: () => void;
}) {
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [data, setData] = useState<EntryPage>({
    items: [],
    total: 0,
    page: 1,
    page_size: pageSize,
  });
  const [projectOptions, setProjectOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setListError(null);
    try {
      const result = await fetchEntries(filters, page, pageSize);
      setData(result);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load entries");
    } finally {
      setLoading(false);
    }
  }

  async function loadProjects() {
    try {
      const result = await fetchEntries({}, 1, 100);
      const projects = Array.from(
        new Set(result.items.map((e) => e.project).filter((p) => p)),
      ).sort();
      setProjectOptions(projects);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    load();
  }, [filters, page]);

  const totals = data.items.reduce<Record<string, number>>((acc, e) => {
    acc[e.project] = (acc[e.project] ?? 0) + e.hours;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-slate-800">Timesheet</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">{username}</span>
            <button onClick={onSignOut} className={btnSecondary}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <QuickEntry
          projectOptions={projectOptions}
          onCreated={() => {
            load();
            loadProjects();
          }}
        />

        <FiltersBar filters={filters} onChange={(f) => {
          setFilters(f);
          setPage(1);
        }} />

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => downloadCsv("entries", filters).catch((e) =>
              setListError(e.message),
            )}
            className={btnPrimary}
          >
            Export CSV
          </button>
          <button
            onClick={() => downloadCsv("summary", filters).catch((e) =>
              setListError(e.message),
            )}
            className={btnSecondary}
          >
            Export totals
          </button>
        </div>

        {listError && <p className="text-sm text-red-600">{listError}</p>}

        <EntryList
          entries={data.items}
          loading={loading}
          onChanged={load}
          onChangedProjects={loadProjects}
        />

        <Totals totals={totals} />

        <Paging
          total={data.total}
          page={page}
          pageSize={pageSize}
          onPage={setPage}
        />
      </main>
    </div>
  );
}

function QuickEntry({
  projectOptions,
  onCreated,
}: {
  projectOptions: string[];
  onCreated: () => void;
}) {
  const [project, setProject] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await createEntry({
        project,
        description,
        hours: Number(hours),
        date,
      });
      if (!res.ok) {
        setError(res.error ?? "Failed to add entry");
        return;
      }
      setProject("");
      setDescription("");
      setHours("");
      setDate(todayISO());
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg bg-white p-5 shadow">
      <h2 className="mb-4 text-base font-semibold text-slate-800">Log time</h2>
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div>
          <label className={labelCls} htmlFor="project">
            Project
          </label>
          <input
            id="project"
            list="project-suggestions"
            className={`${inputCls} w-full`}
            value={project}
            onChange={(e) => setProject(e.target.value)}
            required
          />
          <datalist id="project-suggestions">
            {projectOptions.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="description">
            Description
          </label>
          <input
            id="description"
            className={`${inputCls} w-full`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:col-span-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="hours">
              Hours
            </label>
            <input
              id="hours"
              type="number"
              step="any"
              min="0"
              className={`${inputCls} w-full`}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="date">
              Date
            </label>
            <input
              id="date"
              type="date"
              className={`${inputCls} w-full`}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="sm:col-span-4">
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={busy} className={btnPrimary}>
            Add entry
          </button>
        </div>
      </form>
    </section>
  );
}

function FiltersBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const [start, setStart] = useState(filters.start_date ?? "");
  const [end, setEnd] = useState(filters.end_date ?? "");
  const [project, setProject] = useState(filters.project ?? "");

  function apply() {
    onChange({
      start_date: isISODate(start) ? start : undefined,
      end_date: isISODate(end) ? end : undefined,
      project: project.trim() || undefined,
    });
  }

  return (
    <section className="rounded-lg bg-white p-5 shadow">
      <h2 className="mb-4 text-base font-semibold text-slate-800">Filters</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div>
          <label className={labelCls} htmlFor="f-start">
            From
          </label>
          <input
            id="f-start"
            type="date"
            className={`${inputCls} w-full`}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="f-end">
            To
          </label>
          <input
            id="f-end"
            type="date"
            className={`${inputCls} w-full`}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="f-project">
            Project
          </label>
          <input
            id="f-project"
            className={`${inputCls} w-full`}
            value={project}
            onChange={(e) => setProject(e.target.value)}
          />
        </div>
        <div className="flex items-end gap-2">
          <button onClick={apply} className={btnPrimary}>
            Apply
          </button>
          <button
            onClick={() => {
              setStart("");
              setEnd("");
              setProject("");
              onChange({});
            }}
            className={btnSecondary}
          >
            Clear
          </button>
        </div>
      </div>
    </section>
  );
}

function EntryList({
  entries,
  loading,
  onChanged,
  onChangedProjects,
}: {
  entries: Entry[];
  loading: boolean;
  onChanged: () => void;
  onChangedProjects: () => void;
}) {
  if (loading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">No entries yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg bg-white shadow">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Project</th>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3">Hours</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              onChanged={() => {
                onChanged();
                onChangedProjects();
              }}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EntryRow({
  entry,
  onChanged,
}: {
  entry: Entry;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [project, setProject] = useState(entry.project);
  const [description, setDescription] = useState(entry.description);
  const [hours, setHours] = useState(String(entry.hours));
  const [date, setDate] = useState(entry.date);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const res = await updateEntry(entry.id, {
        project,
        description,
        hours: Number(hours),
        date,
      });
      if (!res.ok) {
        setError(res.error ?? "Failed to update");
        return;
      }
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this entry?")) return;
    const res = await deleteEntry(entry.id);
    if (res.ok) {
      onChanged();
    }
  }

  if (editing) {
    return (
      <tr className="border-b border-slate-100 align-top">
        <td className="px-4 py-2">
          <input
            type="date"
            className={`${inputCls} w-36`}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </td>
        <td className="px-4 py-2">
          <input
            className={`${inputCls} w-32`}
            value={project}
            onChange={(e) => setProject(e.target.value)}
          />
        </td>
        <td className="px-4 py-2">
          <input
            className={`${inputCls} w-full`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </td>
        <td className="px-4 py-2">
          <input
            type="number"
            step="any"
            min="0"
            className={`${inputCls} w-24`}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </td>
        <td className="px-4 py-2">
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className={btnPrimary}>
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className={btnSecondary}
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
    <tr className="border-b border-slate-100">
      <td className="px-4 py-3">{entry.date}</td>
      <td className="px-4 py-3 font-medium">{entry.project}</td>
      <td className="px-4 py-3 text-slate-600">{entry.description}</td>
      <td className="px-4 py-3">{entry.hours}</td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button onClick={() => setEditing(true)} className={btnSecondary}>
            Edit
          </button>
          <button
            onClick={remove}
            className="rounded border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

function Totals({ totals }: { totals: Record<string, number> }) {
  const projects = Object.keys(totals).sort();
  if (projects.length === 0) return null;
  return (
    <section className="rounded-lg bg-white p-5 shadow">
      <h2 className="mb-3 text-base font-semibold text-slate-800">
        Totals per project
      </h2>
      <table className="w-full max-w-xs text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
          <tr>
            <th className="py-2 pr-4">Project</th>
            <th className="py-2">Hours</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p} className="border-b border-slate-100">
              <td className="py-2 pr-4 font-medium">{p}</td>
              <td className="py-2">{totals[p]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Paging({
  total,
  page,
  pageSize,
  onPage,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between text-sm text-slate-600">
      <span>
        {total} entr{total === 1 ? "y" : "ies"}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className={btnSecondary}
        >
          Previous
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className={btnSecondary}
        >
          Next
        </button>
      </div>
    </div>
  );
}
