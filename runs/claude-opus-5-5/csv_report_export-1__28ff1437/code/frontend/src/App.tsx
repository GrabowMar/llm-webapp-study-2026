import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ApiError,
  clearSession,
  createEntry,
  deleteEntry,
  downloadCsv,
  formatHours,
  getSession,
  getSummary,
  hoursPayload,
  listEntries,
  listProjects,
  login,
  logout,
  onUnauthorized,
  register,
  todayIso,
  toIso,
  updateEntry,
} from "./api";
import type { Entry, EntryPage, Filters, Summary } from "./api";

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100";
const btnPrimary =
  "inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60";
const btnSecondary =
  "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";
const btnDanger =
  "inline-flex items-center justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-60";
const PAGE_SIZE = 20;

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

function fieldErrors(err: unknown): Record<string, string> {
  return err instanceof ApiError ? err.fieldErrors : {};
}

function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs text-red-600" role="alert">
      {message}
    </p>
  );
}

function Alert({ kind, children }: { kind: "error" | "success"; children: ReactNode }) {
  const cls =
    kind === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${cls}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

function AuthScreen({ onSignedIn }: { onSignedIn: (username: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    setNotice(null);
    try {
      if (mode === "register") {
        await register(username, password);
      }
      const name = await login(username, password);
      onSignedIn(name);
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrors(err));
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: "login" | "register") {
    setMode(next);
    setError(null);
    setErrors({});
    setNotice(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-md">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Timesheet</h1>
        <p className="mb-5 text-sm text-slate-500">Track your hours and export them as CSV.</p>
        <div className="mb-5 grid grid-cols-2 rounded-md bg-slate-100 p-1 text-sm" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={`rounded px-3 py-1.5 font-medium ${mode === "login" ? "bg-white shadow text-slate-900" : "text-slate-500"}`}
            onClick={() => switchMode("login")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={`rounded px-3 py-1.5 font-medium ${mode === "register" ? "bg-white shadow text-slate-900" : "text-slate-500"}`}
            onClick={() => switchMode("register")}
          >
            Register
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4" aria-label={mode === "login" ? "Sign in" : "Register"}>
          <div>
            <label htmlFor="auth-username" className="mb-1 block text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              id="auth-username"
              name="username"
              autoComplete="username"
              className={inputCls}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <FieldError message={errors.username} />
          </div>
          <div>
            <label htmlFor="auth-password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="auth-password"
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <FieldError message={errors.password} />
          </div>
          {error && Object.keys(errors).length === 0 && <Alert kind="error">{error}</Alert>}
          {notice && <Alert kind="success">{notice}</Alert>}
          <button type="submit" className={`${btnPrimary} w-full`} disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

function QuickEntryForm({ projects, onCreated }: { projects: string[]; onCreated: (e: Entry) => void }) {
  const [project, setProject] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    setSaved(false);
    try {
      const entry = await createEntry({ project, description, hours: hoursPayload(hours), date });
      setDescription("");
      setHours("");
      setSaved(true);
      onCreated(entry);
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrors(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Log time</h2>
      <form onSubmit={submit} noValidate aria-label="Log time" className="grid gap-4 md:grid-cols-12">
        <div className="md:col-span-3">
          <label htmlFor="new-project" className="mb-1 block text-sm font-medium text-slate-700">
            Project
          </label>
          <input
            id="new-project"
            name="project"
            list="project-suggestions"
            autoComplete="off"
            className={inputCls}
            value={project}
            onChange={(e) => setProject(e.target.value)}
            aria-invalid={!!errors.project}
          />
          <FieldError message={errors.project} />
        </div>
        <div className="md:col-span-5">
          <label htmlFor="new-description" className="mb-1 block text-sm font-medium text-slate-700">
            Description
          </label>
          <input
            id="new-description"
            name="description"
            className={inputCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-invalid={!!errors.description}
          />
          <FieldError message={errors.description} />
        </div>
        <div className="md:col-span-1">
          <label htmlFor="new-hours" className="mb-1 block text-sm font-medium text-slate-700">
            Hours
          </label>
          <input
            id="new-hours"
            name="hours"
            inputMode="decimal"
            className={inputCls}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            aria-invalid={!!errors.hours}
          />
          <FieldError message={errors.hours} />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="new-date" className="mb-1 block text-sm font-medium text-slate-700">
            Date
          </label>
          <input
            id="new-date"
            name="date"
            type="date"
            className={inputCls}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={!!errors.date}
          />
          <FieldError message={errors.date} />
        </div>
        <div className="flex items-start md:col-span-1 md:pt-6">
          <button type="submit" className={`${btnPrimary} w-full`} disabled={busy}>
            Add
          </button>
        </div>
        <datalist id="project-suggestions">
          {projects.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        {(error && Object.keys(errors).length === 0) || saved ? (
          <div className="md:col-span-12">
            {error && Object.keys(errors).length === 0 && <Alert kind="error">{error}</Alert>}
            {saved && <Alert kind="success">Entry saved.</Alert>}
          </div>
        ) : null}
      </form>
    </section>
  );
}

type Period = "all" | "week" | "month" | "last-month" | "custom";

function periodRange(period: Period): { start: string; end: string } {
  const now = new Date();
  if (period === "week") {
    const day = (now.getDay() + 6) % 7;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { start: toIso(start), end: toIso(end) };
  }
  if (period === "month") {
    return {
      start: toIso(new Date(now.getFullYear(), now.getMonth(), 1)),
      end: toIso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }
  if (period === "last-month") {
    return {
      start: toIso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      end: toIso(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  return { start: "", end: "" };
}

function FilterBar({
  filters,
  projects,
  onChange,
}: {
  filters: Filters;
  projects: string[];
  onChange: (f: Filters) => void;
}) {
  const [period, setPeriod] = useState<Period>("all");

  function choosePeriod(p: Period) {
    setPeriod(p);
    if (p !== "custom") {
      const { start, end } = periodRange(p);
      onChange({ ...filters, start_date: start, end_date: end });
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label htmlFor="filter-period" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Period
        </label>
        <select
          id="filter-period"
          className={inputCls}
          value={period}
          onChange={(e) => choosePeriod(e.target.value as Period)}
        >
          <option value="all">All time</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
          <option value="last-month">Last month</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div>
        <label htmlFor="filter-start" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          From
        </label>
        <input
          id="filter-start"
          type="date"
          className={inputCls}
          value={filters.start_date}
          onChange={(e) => {
            setPeriod("custom");
            onChange({ ...filters, start_date: e.target.value });
          }}
        />
      </div>
      <div>
        <label htmlFor="filter-end" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          To
        </label>
        <input
          id="filter-end"
          type="date"
          className={inputCls}
          value={filters.end_date}
          onChange={(e) => {
            setPeriod("custom");
            onChange({ ...filters, end_date: e.target.value });
          }}
        />
      </div>
      <div>
        <label htmlFor="filter-project" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Project
        </label>
        <select
          id="filter-project"
          className={inputCls}
          value={filters.project}
          onChange={(e) => onChange({ ...filters, project: e.target.value })}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          {filters.project && !projects.includes(filters.project) && (
            <option value={filters.project}>{filters.project}</option>
          )}
        </select>
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  onSaved,
  onDeleted,
}: {
  entry: Entry;
  onSaved: (e: Entry) => void;
  onDeleted: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [project, setProject] = useState(entry.project);
  const [description, setDescription] = useState(entry.description);
  const [hours, setHours] = useState(String(entry.hours));
  const [date, setDate] = useState(entry.date);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setProject(entry.project);
    setDescription(entry.description);
    setHours(String(entry.hours));
    setDate(entry.date);
    setError(null);
    setErrors({});
    setConfirming(false);
    setEditing(true);
  }

  async function save(e?: FormEvent) {
    e?.preventDefault();
    const changes: Record<string, unknown> = {};
    if (project !== entry.project) changes.project = project;
    if (description !== entry.description) changes.description = description;
    const h = hoursPayload(hours);
    if (h !== entry.hours) changes.hours = h;
    if (date !== entry.date) changes.date = date;
    if (Object.keys(changes).length === 0) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const updated = await updateEntry(entry.id, changes);
      setEditing(false);
      onSaved(updated);
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrors(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteEntry(entry.id);
      onDeleted(entry.id);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (editing) {
    const formId = `edit-${entry.id}`;
    return (
      <tr className="bg-indigo-50/50 align-top" data-entry-id={entry.id}>
        <td className="px-3 py-2">
          <input
            form={formId}
            type="date"
            aria-label="Date"
            className={inputCls}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <FieldError message={errors.date} />
        </td>
        <td className="px-3 py-2">
          <input
            form={formId}
            aria-label="Project"
            list="project-suggestions"
            className={inputCls}
            value={project}
            onChange={(e) => setProject(e.target.value)}
          />
          <FieldError message={errors.project} />
        </td>
        <td className="px-3 py-2">
          <input
            form={formId}
            aria-label="Description"
            className={inputCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <FieldError message={errors.description} />
        </td>
        <td className="px-3 py-2">
          <input
            form={formId}
            aria-label="Hours"
            inputMode="decimal"
            className={`${inputCls} text-right`}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
          <FieldError message={errors.hours} />
        </td>
        <td className="px-3 py-2 text-right">
          <form id={formId} onSubmit={save} noValidate className="flex justify-end gap-2">
            <button type="submit" className={btnPrimary} disabled={busy}>
              Save
            </button>
            <button type="button" className={btnSecondary} onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
          </form>
          {error && Object.keys(errors).length === 0 && (
            <p className="mt-1 text-xs text-red-600" role="alert">
              {error}
            </p>
          )}
        </td>
      </tr>
    );
  }

  return (
    <tr className="align-top hover:bg-slate-50" data-entry-id={entry.id}>
      <td className="whitespace-nowrap px-3 py-2 text-sm text-slate-700">{entry.date}</td>
      <td className="px-3 py-2 text-sm font-medium text-slate-900 break-words">{entry.project}</td>
      <td className="px-3 py-2 text-sm text-slate-600 whitespace-pre-wrap break-words">{entry.description}</td>
      <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-900">{formatHours(entry.hours)}</td>
      <td className="px-3 py-2 text-right">
        {confirming ? (
          <div className="flex flex-wrap items-center justify-end gap-2" role="group" aria-label="Confirm delete">
            <span className="text-sm text-slate-700">Delete this entry?</span>
            <button type="button" className={btnDanger} onClick={remove} disabled={busy}>
              Yes, delete
            </button>
            <button type="button" className={btnSecondary} onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <button type="button" className={btnSecondary} onClick={startEdit}>
              Edit
            </button>
            <button
              type="button"
              className={`${btnSecondary} text-red-600 hover:bg-red-50`}
              onClick={() => setConfirming(true)}
            >
              Delete
            </button>
          </div>
        )}
        {error && (
          <p className="mt-1 text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </td>
    </tr>
  );
}

function Totals({ summary }: { summary: Summary | null }) {
  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200" aria-label="Totals per project">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Totals per project</h2>
      {!summary || summary.items.length === 0 ? (
        <p className="text-sm text-slate-500">No hours in this period.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {summary.items.map((t) => (
              <tr key={t.project}>
                <td className="py-1.5 pr-3 text-slate-700 break-all">{t.project}</td>
                <td className="py-1.5 text-right tabular-nums font-medium text-slate-900">{formatHours(t.hours)} h</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200">
              <td className="pt-2 font-semibold text-slate-900">Total</td>
              <td className="pt-2 text-right tabular-nums font-semibold text-slate-900">
                {formatHours(summary.total_hours)} h
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </section>
  );
}

function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-slate-200 px-3 py-3" aria-label="Pagination">
      <p className="text-sm text-slate-500">
        {total === 0 ? "No entries" : `Showing ${from}–${to} of ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" className={btnSecondary} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <span className="text-sm text-slate-600">
          Page {page} of {pages}
        </span>
        <button type="button" className={btnSecondary} disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </nav>
  );
}

function Dashboard({ username, onSignOut }: { username: string; onSignOut: () => void }) {
  const [filters, setFilters] = useState<Filters>({ start_date: "", end_date: "", project: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<EntryPage | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [projects, setProjects] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"entries" | "summary" | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listEntries(filters, page, PAGE_SIZE), getSummary(filters), listProjects()])
      .then(([entries, sum, projs]) => {
        if (cancelled) return;
        const pages = Math.max(1, Math.ceil(entries.total / PAGE_SIZE));
        if (page > pages) {
          setPage(pages);
          return;
        }
        setData(entries);
        setSummary(sum);
        setProjects(projs);
        setLoadError(null);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, page, reloadKey]);

  function changeFilters(f: Filters) {
    setFilters(f);
    setPage(1);
  }

  async function exportCsv(kind: "entries" | "summary") {
    setExporting(kind);
    setExportError(null);
    try {
      await downloadCsv(kind, filters);
    } catch (err) {
      setExportError(errorMessage(err));
    } finally {
      setExporting(null);
    }
  }

  const sortedProjects = useMemo(() => [...projects].sort((a, b) => a.localeCompare(b)), [projects]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <h1 className="text-xl font-semibold text-slate-900">Timesheet</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              Signed in as <strong className="font-semibold text-slate-900" data-testid="current-user">{username}</strong>
            </span>
            <button type="button" className={btnSecondary} onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <QuickEntryForm projects={projects} onCreated={reload} />

        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200" aria-label="Entries">
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">Entries</h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => exportCsv("entries")}
                    disabled={exporting !== null}
                  >
                    {exporting === "entries" ? "Exporting…" : "Export CSV"}
                  </button>
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => exportCsv("summary")}
                    disabled={exporting !== null}
                  >
                    {exporting === "summary" ? "Exporting…" : "Export totals"}
                  </button>
                </div>
              </div>
              <FilterBar filters={filters} projects={sortedProjects} onChange={changeFilters} />
              {loadError && <Alert kind="error">{loadError}</Alert>}
              {exportError && <Alert kind="error">{exportError}</Alert>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-t border-slate-200">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-36 px-3 py-2">Date</th>
                    <th className="w-40 px-3 py-2">Project</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="w-24 px-3 py-2 text-right">Hours</th>
                    <th className="w-56 px-3 py-2 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data?.items.map((entry) => (
                    <EntryRow
                      key={`${entry.id}-${entry.project}-${entry.description}-${entry.hours}-${entry.date}`}
                      entry={entry}
                      onSaved={reload}
                      onDeleted={reload}
                    />
                  ))}
                  {data && data.items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">
                        {loading ? "Loading…" : "No entries for these filters."}
                      </td>
                    </tr>
                  )}
                  {!data && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">
                        Loading…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pager page={page} total={data?.total ?? 0} pageSize={PAGE_SIZE} onPage={setPage} />
          </section>

          <aside>
            <Totals summary={summary} />
          </aside>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [username, setUsername] = useState<string | null>(() => getSession()?.username ?? null);

  useEffect(() => {
    onUnauthorized(() => {
      clearSession();
      setUsername(null);
    });
    return () => onUnauthorized(null);
  }, []);

  async function signOut() {
    await logout();
    setUsername(null);
  }

  if (!username) return <AuthScreen onSignedIn={setUsername} />;
  return <Dashboard key={username} username={username} onSignOut={signOut} />;
}
