import { useState } from "react";
import { ApiError, deleteEntry, updateEntry } from "../api";
import type { Entry } from "../types";

const cellClass = "px-4 py-3 align-middle text-sm text-slate-700";
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

function formatHours(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function EntryRow({
  entry,
  onChanged,
}: {
  entry: Entry;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    project: entry.project,
    description: entry.description,
    hours: String(entry.hours),
    date: entry.date,
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function startEditing() {
    setDraft({
      project: entry.project,
      description: entry.description,
      hours: String(entry.hours),
      date: entry.date,
    });
    setError(null);
    setFieldErrors({});
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await updateEntry(entry.id, draft);
      setEditing(false);
      onChanged();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors(caught.fields);
      } else {
        setError("The entry could not be saved.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this entry? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteEntry(entry.id);
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The entry could not be deleted.");
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <tr className="border-t border-slate-100 hover:bg-slate-50/70">
        <td className={`${cellClass} whitespace-nowrap font-medium text-slate-900`}>{entry.date}</td>
        <td className={cellClass}>{entry.project}</td>
        <td className={`${cellClass} max-w-md`}>
          <span className="line-clamp-2">{entry.description || "—"}</span>
        </td>
        <td className={`${cellClass} tabular-nums`}>{formatHours(entry.hours)}</td>
        <td className={`${cellClass} whitespace-nowrap text-right`}>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={startEditing}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-indigo-100 bg-indigo-50/40">
      <td className={cellClass}>
        <input
          type="date"
          value={draft.date}
          onChange={(event) => setDraft({ ...draft, date: event.target.value })}
          className={inputClass}
        />
        {fieldErrors.date ? <p className="mt-1 text-xs text-rose-600">{fieldErrors.date}</p> : null}
      </td>
      <td className={cellClass}>
        <input
          value={draft.project}
          onChange={(event) => setDraft({ ...draft, project: event.target.value })}
          className={inputClass}
        />
        {fieldErrors.project ? (
          <p className="mt-1 text-xs text-rose-600">{fieldErrors.project}</p>
        ) : null}
      </td>
      <td className={cellClass}>
        <input
          value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          className={inputClass}
        />
        {fieldErrors.description ? (
          <p className="mt-1 text-xs text-rose-600">{fieldErrors.description}</p>
        ) : null}
      </td>
      <td className={cellClass}>
        <input
          type="number"
          min="0"
          step="0.25"
          value={draft.hours}
          onChange={(event) => setDraft({ ...draft, hours: event.target.value })}
          className={`${inputClass} w-24`}
        />
        {fieldErrors.hours ? <p className="mt-1 text-xs text-rose-600">{fieldErrors.hours}</p> : null}
      </td>
      <td className={`${cellClass} whitespace-nowrap text-right`}>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
        {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
      </td>
    </tr>
  );
}

interface Props {
  items: Entry[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onChanged: () => void;
}

export default function EntryList({
  items,
  total,
  page,
  pageSize,
  loading,
  onPageChange,
  onPageSizeChange,
  onChanged,
}: Props) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Entries</h2>
        <p className="text-sm text-slate-500">
          {loading ? "Loading…" : `${total} ${total === 1 ? "entry" : "entries"}`}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className={`${cellClass} py-2.5`}>Date</th>
              <th className={`${cellClass} py-2.5`}>Project</th>
              <th className={`${cellClass} py-2.5`}>Description</th>
              <th className={`${cellClass} py-2.5`}>Hours</th>
              <th className={`${cellClass} py-2.5 text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((entry) => (
              <EntryRow key={entry.id} entry={entry} onChanged={onChanged} />
            ))}
            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} className={`${cellClass} py-10 text-center text-slate-400`}>
                  No entries match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
        <label className="flex items-center gap-2 text-sm text-slate-500">
          Rows
          <select
            value={pageSize}
            onChange={(event) => {
              onPageSizeChange(Number(event.target.value));
              onPageChange(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span>
            Page {Math.min(page, pageCount)} of {pageCount}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= pageCount}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
