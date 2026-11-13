import { useCallback, useEffect, useState } from "react";
import { api, ApiError, EntryPage, Filters, session, setUnauthorizedHandler, Summary } from "./api";
import AuthForms, { btnSecondaryCls, inputCls } from "./AuthForms";
import EntryForm from "./EntryForm";
import EntryRow from "./EntryRow";

const PAGE_SIZE = 20;
const emptyFilters: Filters = { start_date: "", end_date: "", project: "" };

function Timesheet({ username, onSignOut }: { username: string; onSignOut: () => void }) {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<EntryPage | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [projects, setProjects] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [entries, sum, proj] = await Promise.all([
        api.entries(filters, page, PAGE_SIZE),
        api.summary(filters),
        api.projects(),
      ]);
      const lastPage = Math.max(1, Math.ceil(entries.total / PAGE_SIZE));
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setData(entries);
      setSummary(sum);
      setProjects(proj.items);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  function changeFilter(key: keyof Filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  async function download(path: string, params: Record<string, string>, name: string) {
    try {
      await api.download(path, params, name);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Download failed");
    }
  }

  async function signOut() {
    try {
      await api.logout();
    } catch {
      /* token may already be invalid */
    }
    onSignOut();
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Timesheet</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-600">
            Signed in as <strong data-testid="username">{username}</strong>
          </span>
          <button className={btnSecondaryCls} onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <EntryForm projects={projects} onCreated={load} />

      <section className="rounded-lg bg-white p-4 shadow">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">From</span>
            <input
              className={inputCls}
              type="date"
              value={filters.start_date}
              onChange={(e) => changeFilter("start_date", e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">To</span>
            <input
              className={inputCls}
              type="date"
              value={filters.end_date}
              onChange={(e) => changeFilter("end_date", e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Project</span>
            <select
              className={inputCls}
              value={filters.project}
              onChange={(e) => changeFilter("project", e.target.value)}
            >
              <option value="">All projects</option>
              {filters.project && !projects.includes(filters.project) && (
                <option value={filters.project}>{filters.project}</option>
              )}
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <button
            className={btnSecondaryCls}
            onClick={() => {
              setFilters(emptyFilters);
              setPage(1);
            }}
          >
            Clear
          </button>
          <div className="ml-auto flex gap-2">
            <button
              className={btnSecondaryCls}
              onClick={() => download("/api/exports/entries.csv", { ...filters }, "entries.csv")}
            >
              Export CSV
            </button>
            <button
              className={btnSecondaryCls}
              onClick={() =>
                download(
                  "/api/exports/summary.csv",
                  { start_date: filters.start_date, end_date: filters.end_date },
                  "summary.csv",
                )
              }
            >
              Export totals
            </button>
          </div>
        </div>

        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="p-2">Date</th>
                <th className="p-2">Project</th>
                <th className="p-2">Description</th>
                <th className="p-2 text-right">Hours</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.items.map((entry) => (
                <EntryRow key={entry.id} entry={entry} onChanged={load} />
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-slate-500">
                    {loading ? "Loading..." : "No entries"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
          <span>{data ? `${data.total} entries` : ""}</span>
          <div className="flex items-center gap-2">
            <button
              className={btnSecondaryCls}
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              className={btnSecondaryCls}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg bg-white p-4 shadow">
        <h2 className="mb-2 font-semibold text-slate-800">Totals per project</h2>
        {summary && summary.items.length > 0 ? (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {summary.items.map((s) => (
                <tr key={s.project}>
                  <td className="p-2">{s.project}</td>
                  <td className="p-2 text-right tabular-nums">{s.hours}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="p-2">Total</td>
                <td className="p-2 text-right tabular-nums">{summary.total_hours}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-500">No hours logged for this period.</p>
        )}
      </section>
    </div>
  );
}

export default function App() {
  const [username, setUsername] = useState<string | null>(session.token ? session.username : null);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      session.clear();
      setUsername(null);
    });
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {username ? (
        <Timesheet
          username={username}
          onSignOut={() => {
            session.clear();
            setUsername(null);
          }}
        />
      ) : (
        <AuthForms onSignedIn={setUsername} />
      )}
    </div>
  );
}
