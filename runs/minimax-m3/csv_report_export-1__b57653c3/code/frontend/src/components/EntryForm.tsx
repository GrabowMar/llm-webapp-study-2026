import { useState, type FormEvent } from "react";
import { ApiError, createEntry } from "../api";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

export function todayISO(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

interface Props {
  projects: string[];
  onCreated: () => void;
}

export default function EntryForm({ projects, onCreated }: Props) {
  const [project, setProject] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    setNotice(null);
    try {
      await createEntry({ project, description, hours, date });
      setDescription("");
      setHours("");
      setNotice("Entry logged.");
      onCreated();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors(caught.fields);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Log time</h2>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="project" className="mb-1.5 block text-sm font-medium text-slate-700">
              Project
            </label>
            <input
              id="project"
              list="project-suggestions"
              value={project}
              onChange={(event) => setProject(event.target.value)}
              className={inputClass}
              placeholder="Website redesign"
            />
            <datalist id="project-suggestions">
              {projects.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {fieldErrors.project ? (
              <p className="mt-1.5 text-sm text-rose-600">{fieldErrors.project}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="date" className="mb-1.5 block text-sm font-medium text-slate-700">
              Date
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={inputClass}
            />
            {fieldErrors.date ? (
              <p className="mt-1.5 text-sm text-rose-600">{fieldErrors.date}</p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <div>
            <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-slate-700">
              Description
            </label>
            <input
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={inputClass}
              placeholder="What did you work on?"
            />
            {fieldErrors.description ? (
              <p className="mt-1.5 text-sm text-rose-600">{fieldErrors.description}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="hours" className="mb-1.5 block text-sm font-medium text-slate-700">
              Hours
            </label>
            <input
              id="hours"
              type="number"
              min="0"
              step="0.25"
              inputMode="decimal"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              className={inputClass}
              placeholder="1.5"
            />
            {fieldErrors.hours ? (
              <p className="mt-1.5 text-sm text-rose-600">{fieldErrors.hours}</p>
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">
            {notice}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Saving…" : "Add entry"}
        </button>
      </form>
    </section>
  );
}
