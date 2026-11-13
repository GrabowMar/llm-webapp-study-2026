import { useState } from "react";
import {
  ApiError,
  type Entry,
  type EntryInput,
  updateEntry,
  deleteEntry,
} from "./api";

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : String(Number(hours.toFixed(2)));
}

function EditRow({
  entry,
  onSaved,
  onCancel,
}: {
  entry: Entry;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<EntryInput>({
    project: entry.project,
    description: entry.description,
    hours: String(entry.hours),
    date: entry.date,
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function set<K extends keyof EntryInput>(key: K, value: EntryInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFields((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError("");
    setFields({});
    try {
      await updateEntry(entry.id, {
        project: form.project,
        description: form.description,
        hours: form.hours,
        date: form.date,
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else {
        setError("Unable to update the entry.");
      }
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200";

  return (
    <tr className="bg-indigo-50/60 align-top">
      <td className="px-3 py-2">
        <input
          value={form.date}
          type="date"
          onChange={(e) => set("date", e.target.value)}
          className={inputClass}
        />
        {fields.date && <p className="mt-1 text-xs text-red-600">{fields.date}</p>}
      </td>
      <td className="px-3 py-2">
        <input
          value={form.project}
          onChange={(e) => set("project", e.target.value)}
          className={inputClass}
        />
        {fields.project && (
          <p className="mt-1 text-xs text-red-600">{fields.project}</p>
        )}
      </td>
      <td className="px-3 py-2">
        <input
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          className={inputClass}
        />
        {fields.description && (
          <p className="mt-1 text-xs text-red-600">{fields.description}</p>
        )}
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          step="0.25"
          min="0.01"
          value={form.hours}
          onChange={(e) => set("hours", e.target.value)}
          className={inputClass}
        />
        {fields.hours && (
          <p className="mt-1 text-xs text-red-600">{fields.hours}</p>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={busy}
            className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}

export default function EntryTable({
  entries,
  onChanged,
}: {
  entries: Entry[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function remove(id: number) {
    setBusy(true);
    setError("");
    try {
      await deleteEntry(id);
      setConfirming(null);
      onChanged();
    } catch {
      setError("Unable to delete the entry.");
    } finally {
      setBusy(false);
    }
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
        No entries match your filters yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {error && (
        <p className="border-b border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Project</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium">Hours</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((entry) =>
              editing === entry.id ? (
                <EditRow
                  key={entry.id}
                  entry={entry}
                  onCancel={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    onChanged();
                  }}
                />
              ) : (
                <tr key={entry.id} className="align-top hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                    {entry.date}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {entry.project}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {entry.description || (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-700">
                    {formatHours(entry.hours)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {confirming === entry.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Delete?</span>
                        <button
                          onClick={() => remove(entry.id)}
                          disabled={busy}
                          className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirming(null)}
                          disabled={busy}
                          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditing(entry.id);
                            setConfirming(null);
                          }}
                          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            setConfirming(entry.id);
                            setEditing(null);
                          }}
                          className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
