import { useState } from "react";
import { api } from "../api";
import type { Entry } from "../types";

interface Props {
  items: Entry[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  onChanged: () => void;
  onUnauthorized: () => void;
}

interface Draft {
  project: string;
  description: string;
  hours: string;
  date: string;
}

function toDraft(entry: Entry): Draft {
  return {
    project: entry.project,
    description: entry.description,
    hours: String(entry.hours),
    date: entry.date,
  };
}

function draftError(draft: Draft): string | null {
  if (!draft.project.trim()) return "Project must not be empty.";
  const hours = Number(draft.hours);
  if (!draft.hours.trim() || !Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return "Hours must be a number between 0 and 24.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return "Date must be YYYY-MM-DD.";
  return null;
}

const input =
  "w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

export default function EntryList({
  items,
  total,
  page,
  pageSize,
  loading,
  error,
  onPage,
  onPageSize,
  onChanged,
  onUnauthorized,
}: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  function startEdit(entry: Entry) {
    setEditingId(entry.id);
    setConfirmId(null);
    setInlineError(null);
    setDraft(toDraft(entry));
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
    setInlineError(null);
  }

  function handleError(err: unknown) {
    if (err && typeof err === "object" && "status" in err && err.status === 401) {
      onUnauthorized();
      return;
    }
    setInlineError(err instanceof Error ? err.message : "Request failed.");
  }

  async function save(entry: Entry) {
    if (!draft || busy) return;
    const invalid = draftError(draft);
    if (invalid) {
      setInlineError(invalid);
      return;
    }
    setBusy(true);
    setInlineError(null);
    try {
      await api.updateEntry(entry.id, {
        project: draft.project.trim(),
        description: draft.description,
        hours: Number(draft.hours),
        date: draft.date,
      });
      cancelEdit();
      onChanged();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry: Entry) {
    if (busy) return;
    setBusy(true);
    setInlineError(null);
    try {
      await api.deleteEntry(entry.id);
      setConfirmId(null);
      if (editingId === entry.id) cancelEdit();
      onChanged();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Entries
        </h2>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <label htmlFor="page-size">
            Rows
            <select
              id="page-size"
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="ml-2 rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              {[10, 25, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <span>
            {total} {total === 1 ? "entry" : "entries"}
          </span>
        </div>
      </div>

      {error && (
        <p role="alert" className="m-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {inlineError && (
        <p role="alert" className="m-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {inlineError}
        </p>
      )}
      {loading && items.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-400">
          No entries for these filters. Log some time above to get started.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Hours</th>
                <th className="px-5 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => {
                const editing = editingId === entry.id && draft !== null;
                return (
                  <tr key={entry.id} className="border-b border-slate-50 align-top">
                    <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                      {editing ? (
                        <input
                          type="date"
                          value={draft.date}
                          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                          className={input}
                        />
                      ) : (
                        entry.date
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {editing ? (
                        <input
                          value={draft.project}
                          onChange={(e) => setDraft({ ...draft, project: e.target.value })}
                          className={input}
                        />
                      ) : (
                        <span className="inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                          {entry.project}
                        </span>
                      )}
                    </td>
                    <td className="max-w-md px-3 py-3 text-slate-600">
                      {editing ? (
                        <textarea
                          rows={2}
                          value={draft.description}
                          onChange={(e) =>
                            setDraft({ ...draft, description: e.target.value })
                          }
                          className={input}
                        />
                      ) : entry.description ? (
                        <span className="whitespace-pre-wrap break-words">
                          {entry.description}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums text-slate-700">
                      {editing ? (
                        <input
                          type="number"
                          min="0.01"
                          max="24"
                          step="0.05"
                          value={draft.hours}
                          onChange={(e) => setDraft({ ...draft, hours: e.target.value })}
                          className={`${input} text-right`}
                        />
                      ) : (
                        entry.hours
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      {editing ? (
                        <span className="inline-flex gap-2">
                          <button
                            onClick={() => save(entry)}
                            disabled={busy}
                            className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={busy}
                            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : confirmId === entry.id ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-xs text-slate-500">Delete?</span>
                          <button
                            onClick={() => remove(entry)}
                            disabled={busy}
                            className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                          >
                            Yes, delete
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            disabled={busy}
                            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Keep
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex gap-2">
                          <button
                            onClick={() => startEdit(entry)}
                            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(null);
                              setDraft(null);
                              setConfirmId(entry.id);
                            }}
                            className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between px-5 py-3 text-sm text-slate-500">
        <span>
          Page {page} of {pages}
        </span>
        <span className="inline-flex gap-2">
          <button
            onClick={() => onPage(page - 1)}
            disabled={page <= 1 || loading}
            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <button
            onClick={() => onPage(page + 1)}
            disabled={page >= pages || loading}
            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </span>
      </div>
    </div>
  );
}
