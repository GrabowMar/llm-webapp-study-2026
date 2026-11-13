import { useEffect, useState } from "react";
import { api } from "../api";
import type { EntryInput } from "../types";

export function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

interface Props {
  suggestions: string[];
  onCreated: () => void;
}

export default function EntryForm({ suggestions, onCreated }: Props) {
  const [project, setProject] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  function validate(): string | null {
    if (!project.trim()) return "Please choose or type a project.";
    const value = Number(hours);
    if (!hours.trim() || !Number.isFinite(value)) return "Hours must be a number.";
    if (value <= 0) return "Hours must be greater than 0.";
    if (value > 24) return "Hours must be at most 24.";
    if (!date) return "Please pick a date.";
    return null;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setBusy(true);
    const input: EntryInput = {
      project: project.trim(),
      description: description.trim(),
      hours: Number(hours),
      date,
    };
    try {
      await api.createEntry(input);
      setDescription("");
      setHours("");
      setSuccess("Entry saved.");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the entry.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";
  const label = "block text-sm font-medium text-slate-700";

  return (
    <form
      onSubmit={submit}
      className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Log time
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={label} htmlFor="new-project">
            Project
          </label>
          <input
            id="new-project"
            list="project-suggestions"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="e.g. Website"
            className={field}
          />
          <datalist id="project-suggestions">
            {suggestions.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div>
          <label className={label} htmlFor="new-description">
            Description
          </label>
          <input
            id="new-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What did you work on?"
            className={field}
          />
        </div>
        <div>
          <label className={label} htmlFor="new-hours">
            Hours
          </label>
          <input
            id="new-hours"
            type="number"
            min="0.01"
            max="24"
            step="0.05"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="2.5"
            className={field}
          />
        </div>
        <div>
          <label className={label} htmlFor="new-date">
            Date
          </label>
          <input
            id="new-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={field}
          />
        </div>
      </div>
      {(error || success) && (
        <p
          role={error ? "alert" : "status"}
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {error ?? success}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Saving…" : "Add entry"}
        </button>
        <p className="text-xs text-slate-400">
          Errors shown here come straight from the API.
        </p>
      </div>
    </form>
  );
}
