import { useEffect, useState } from "react";
import { downloadCsv } from "../api";
import type { Filters } from "../types";

interface Props {
  filters: Filters;
  projects: string[];
  onChange: (filters: Filters) => void;
}

const field =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

export default function FiltersBar({ filters, projects, onChange }: Props) {
  const [draft, setDraft] = useState<Filters>(filters);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(filters), [filters]);

  function apply() {
    onChange({
      start_date: draft.start_date.trim(),
      end_date: draft.end_date.trim(),
      project: draft.project.trim(),
    });
  }

  function clear() {
    const empty: Filters = { start_date: "", end_date: "", project: "" };
    setDraft(empty);
    onChange(empty);
  }

  async function exportCsv(kind: "entries" | "summary") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await downloadCsv(kind, filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="f-start">
            From
          </label>
          <input
            id="f-start"
            type="date"
            value={draft.start_date}
            onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
            className={`${field} mt-1`}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="f-end">
            To
          </label>
          <input
            id="f-end"
            type="date"
            value={draft.end_date}
            onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
            className={`${field} mt-1`}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="f-project">
            Project
          </label>
          <select
            id="f-project"
            value={draft.project}
            onChange={(e) => setDraft({ ...draft, project: e.target.value })}
            className={`${field} mt-1`}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button
            onClick={apply}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Apply
          </button>
          <button
            onClick={clear}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <button
          onClick={() => exportCsv("entries")}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-60"
        >
          <DownloadIcon /> Export CSV
        </button>
        <button
          onClick={() => exportCsv("summary")}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-60"
        >
          <DownloadIcon /> Export totals
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M10 3a1 1 0 0 1 1 1v6.586l2.293-2.293a1 1 0 1 1 1.414 1.414l-4 4a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L9 10.586V4a1 1 0 0 1 1-1Z" />
      <path d="M4 14a1 1 0 0 1 1 1v1h10v-1a1 1 0 1 1 2 0v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a1 1 0 0 1 1-1Z" />
    </svg>
  );
}
