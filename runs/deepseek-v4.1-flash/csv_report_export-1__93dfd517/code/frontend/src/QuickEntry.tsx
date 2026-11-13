import { useState } from "react";
import {
  ApiError,
  createEntry,
  todayISO,
  type EntryInput,
} from "./api";

export default function QuickEntry({
  suggestions,
  onCreated,
}: {
  suggestions: string[];
  onCreated: () => void;
}) {
  const empty: EntryInput = {
    project: "",
    description: "",
    hours: "",
    date: todayISO(),
  };
  const [form, setForm] = useState<EntryInput>(empty);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    setSuccess("");
    try {
      await createEntry(form);
      setForm({ ...empty, project: form.project, date: form.date });
      setSuccess("Entry logged.");
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else {
        setError("Unable to save the entry.");
      }
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Quick entry</h2>
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <div className="md:col-span-3">
          <label
            htmlFor="entry-project"
            className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            Project
          </label>
          <input
            id="entry-project"
            list="project-suggestions"
            value={form.project}
            onChange={(e) => set("project", e.target.value)}
            placeholder="Website redesign"
            className={inputClass}
          />
          <datalist id="project-suggestions">
            {suggestions.map((project) => (
              <option key={project} value={project} />
            ))}
          </datalist>
          {fields.project && (
            <p className="mt-1 text-xs text-red-600">{fields.project}</p>
          )}
        </div>
        <div className="md:col-span-4">
          <label
            htmlFor="entry-description"
            className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            Description
          </label>
          <input
            id="entry-description"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="What did you work on?"
            className={inputClass}
          />
          {fields.description && (
            <p className="mt-1 text-xs text-red-600">{fields.description}</p>
          )}
        </div>
        <div className="md:col-span-2">
          <label
            htmlFor="entry-hours"
            className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            Hours
          </label>
          <input
            id="entry-hours"
            type="number"
            step="0.25"
            min="0.01"
            value={form.hours}
            onChange={(e) => set("hours", e.target.value)}
            placeholder="1.5"
            className={inputClass}
          />
          {fields.hours && (
            <p className="mt-1 text-xs text-red-600">{fields.hours}</p>
          )}
        </div>
        <div className="md:col-span-2">
          <label
            htmlFor="entry-date"
            className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            Date
          </label>
          <input
            id="entry-date"
            type="date"
            value={form.date}
            onChange={(e) => set("date", e.target.value)}
            className={inputClass}
          />
          {fields.date && (
            <p className="mt-1 text-xs text-red-600">{fields.date}</p>
          )}
        </div>
        <div className="flex items-end md:col-span-1">
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "…" : "Add"}
          </button>
        </div>
      </form>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-3 text-sm text-emerald-600">{success}</p>}
    </section>
  );
}
