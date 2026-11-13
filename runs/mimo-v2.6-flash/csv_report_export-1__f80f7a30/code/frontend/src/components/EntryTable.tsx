import { useState } from "react";
import {
  ApiError,
  deleteEntry,
  updateEntry,
  type EntriesPage,
  type Entry,
  type EntryDraft,
} from "../api";

type Props = {
  entries: EntriesPage | null;
  loading: boolean;
  projects: string[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onChanged: () => void;
  onUnauthorized: () => void;
};

type Draft = {
  project: string;
  description: string;
  hours: string;
  date: string;
};

const cellInputClass =
  "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

function draftOf(entry: Entry): Draft {
  return {
    project: entry.project,
    description: entry.description,
    hours: String(entry.hours),
    date: entry.date,
  };
}

export default function EntryTable({
  entries,
  loading,
  projects,
  page,
  totalPages,
  onPageChange,
  onChanged,
  onUnauthorized,
}: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function startEdit(entry: Entry) {
    setEditingId(entry.id);
    setDraft(draftOf(entry));
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
    setError(null);
  }

  function handleError(err: unknown) {
    if (err instanceof ApiError && err.status === 401) {
      onUnauthorized();
      return;
    }
    setError(err instanceof Error ? err.message : "Something went wrong");
  }

  async function saveEdit(entry: Entry) {
    if (!draft) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const changes: Partial<EntryDraft> = {};
      if (draft.project !== entry.project) {
        changes.project = draft.project;
      }
      if (draft.description !== entry.description) {
        changes.description = draft.description;
      }
      if (Number(draft.hours) !== entry.hours || draft.hours.trim() === "") {
        changes.hours = draft.hours;
      }
      if (draft.date !== entry.date) {
        changes.date = draft.date;
      }
      if (Object.keys(changes).length > 0) {
        await updateEntry(entry.id, changes);
      }
      cancelEdit();
      onChanged();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry: Entry) {
    const confirmed = window.confirm(
      `Delete the entry "${entry.description}" for ${entry.project} on ${entry.date}?`,
    );
    if (!confirmed) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteEntry(entry.id);
      onChanged();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  const items = entries?.items ?? [];

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">Entries</h2>
        <span className="text-xs text-gray-500">
          {entries ? `${entries.total} matching` : "\u00a0"}
        </span>
      </div>

      {error && (
        <div
          role="alert"
          className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Project</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2 text-right">Hours</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((entry) =>
              editingId === entry.id && draft ? (
                <tr key={entry.id} className="bg-blue-50/50">
                  <td className="px-3 py-2">
                    <input
                      aria-label="Date"
                      type="date"
                      value={draft.date}
                      onChange={(event) =>
                        setDraft({ ...draft, date: event.target.value })
                      }
                      className={cellInputClass}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label="Project"
                      type="text"
                      list="entry-project-suggestions"
                      value={draft.project}
                      onChange={(event) =>
                        setDraft({ ...draft, project: event.target.value })
                      }
                      className={cellInputClass}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label="Description"
                      type="text"
                      value={draft.description}
                      onChange={(event) =>
                        setDraft({ ...draft, description: event.target.value })
                      }
                      className={cellInputClass}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label="Hours"
                      type="text"
                      inputMode="decimal"
                      value={draft.hours}
                      onChange={(event) =>
                        setDraft({ ...draft, hours: event.target.value })
                      }
                      className={cellInputClass}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => saveEdit(entry)}
                      disabled={busy}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={busy}
                      className="ml-2 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">
                    {entry.date}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">
                    {entry.project}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {entry.description}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
                    {entry.hours}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => startEdit(entry)}
                      className="text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(entry)}
                      disabled={busy}
                      className="ml-3 text-red-600 hover:text-red-700 hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ),
            )}
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-sm text-gray-500"
                >
                  {loading
                    ? "Loading entries…"
                    : "No entries match the current filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
        <span className="text-xs text-gray-500">
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      <datalist id="entry-project-suggestions">
        {projects.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  );
}
