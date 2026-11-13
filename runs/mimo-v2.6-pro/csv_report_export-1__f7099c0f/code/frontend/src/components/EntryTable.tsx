import { useState } from "react";
import { Entry, deleteEntry, errorMessage, updateEntry } from "../api";

interface Props {
  entries: Entry[];
  projects: string[];
  onChanged: () => void;
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

export default function EntryTable({ entries, projects, onChanged }: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function startEdit(entry: Entry) {
    setEditingId(entry.id);
    setDraft(toDraft(entry));
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
    setEditError(null);
  }

  async function saveEdit(id: number) {
    if (!draft) return;
    setBusy(true);
    setEditError(null);
    try {
      await updateEntry(id, {
        project: draft.project,
        description: draft.description,
        hours: draft.hours.trim(),
        date: draft.date,
      });
      cancelEdit();
      onChanged();
    } catch (err) {
      setEditError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry: Entry) {
    const confirmed = window.confirm(
      `Delete the entry "${entry.project}" on ${entry.date} (${entry.hours} h)?`,
    );
    if (!confirmed) return;
    setBusy(true);
    setEditError(null);
    try {
      await deleteEntry(entry.id);
      if (editingId === entry.id) cancelEdit();
      onChanged();
    } catch (err) {
      setEditError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <div>
      {editError && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>
      )}
      <div className="overflow-x-auto">
      <datalist id="entry-table-projects">
        {projects.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">Project</th>
            <th className="py-2 pr-3 font-medium">Description</th>
            <th className="py-2 pr-3 font-medium">Hours</th>
            <th className="py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-slate-500">
                No entries match the current filters.
              </td>
            </tr>
          )}
          {entries.map((entry) => {
            const editing = editingId === entry.id && draft !== null;
            return (
              <tr key={entry.id} className="border-b border-slate-100 align-middle">
                {editing ? (
                  <>
                    <td className="py-2 pr-3">
                      <input
                        type="date"
                        aria-label="Date"
                        value={draft.date}
                        onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                        className={inputClass}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        list="entry-table-projects"
                        aria-label="Project"
                        value={draft.project}
                        onChange={(e) => setDraft({ ...draft, project: e.target.value })}
                        className={inputClass}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        aria-label="Description"
                        value={draft.description}
                        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                        className={inputClass}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        aria-label="Hours"
                        value={draft.hours}
                        onChange={(e) => setDraft({ ...draft, hours: e.target.value })}
                        className={inputClass}
                      />
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => saveEdit(entry.id)}
                          disabled={busy}
                          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={busy}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-700">{entry.date}</td>
                    <td className="py-2 pr-3 font-medium text-slate-900">{entry.project}</td>
                    <td className="py-2 pr-3 text-slate-700">{entry.description}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-700">{entry.hours}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(entry)}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(entry)}
                          className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
