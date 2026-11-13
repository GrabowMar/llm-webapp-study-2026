import { useState } from "react";
import { ApiError, downloadCsv } from "../api";
import type { EntryFilters } from "../types";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

interface Props {
  filters: EntryFilters;
  projects: string[];
  onChange: (filters: EntryFilters) => void;
}

export default function FiltersBar({ filters, projects, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function update(patch: Partial<EntryFilters>) {
    onChange({ ...filters, ...patch });
  }

  async function exportCsv(kind: "entries" | "summary") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "entries") {
        await downloadCsv(
          "/exports/entries.csv",
          {
            start_date: filters.start_date,
            end_date: filters.end_date,
            project: filters.project,
          },
          "entries.csv",
        );
      } else {
        await downloadCsv(
          "/exports/summary.csv",
          { start_date: filters.start_date, end_date: filters.end_date },
          "summary.csv",
        );
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The export failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid flex-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="start_date" className="mb-1.5 block text-sm font-medium text-slate-700">
              From
            </label>
            <input
              id="start_date"
              type="date"
              value={filters.start_date}
              onChange={(event) => update({ start_date: event.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="end_date" className="mb-1.5 block text-sm font-medium text-slate-700">
              To
            </label>
            <input
              id="end_date"
              type="date"
              value={filters.end_date}
              onChange={(event) => update({ end_date: event.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="filter_project" className="mb-1.5 block text-sm font-medium text-slate-700">
              Project
            </label>
            <select
              id="filter_project"
              value={filters.project}
              onChange={(event) => update({ project: event.target.value })}
              className={inputClass}
            >
              <option value="">All projects</option>
              {projects.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={buttonClass}
            onClick={() => onChange({ start_date: "", end_date: "", project: "" })}
          >
            Clear
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={busy !== null}
            onClick={() => exportCsv("entries")}
          >
            {busy === "entries" ? "Exporting…" : "Export CSV"}
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={busy !== null}
            onClick={() => exportCsv("summary")}
          >
            {busy === "summary" ? "Exporting…" : "Export totals"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      ) : null}
    </section>
  );
}
