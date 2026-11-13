import { useState, type FormEvent } from "react";
import { createEntry } from "../api";

type Props = {
  projects: string[];
  onCreated: () => void;
};

const fieldClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function QuickEntryForm({ projects, onCreated }: Props) {
  const [project, setProject] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const numeric = Number(hours);
      await createEntry({
        project,
        description,
        hours: hours.trim() !== "" && Number.isFinite(numeric) ? numeric : hours,
        date,
      });
      setDescription("");
      setHours("");
      setDate(today());
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add entry");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Log time</h2>
        <span className="text-xs text-gray-500">Quick entry</span>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_1fr_1fr_auto]">
        <div>
          <label
            htmlFor="entry-project"
            className="block text-xs font-medium text-gray-700"
          >
            Project
          </label>
          <input
            id="entry-project"
            name="project"
            type="text"
            list="project-suggestions"
            value={project}
            onChange={(event) => setProject(event.target.value)}
            placeholder="Project name"
            className={fieldClass}
          />
          <datalist id="project-suggestions">
            {projects.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        <div>
          <label
            htmlFor="entry-description"
            className="block text-xs font-medium text-gray-700"
          >
            Description
          </label>
          <input
            id="entry-description"
            name="description"
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What did you work on?"
            className={fieldClass}
          />
        </div>

        <div>
          <label
            htmlFor="entry-hours"
            className="block text-xs font-medium text-gray-700"
          >
            Hours
          </label>
          <input
            id="entry-hours"
            name="hours"
            type="text"
            inputMode="decimal"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            placeholder="e.g. 1.5"
            className={fieldClass}
          />
        </div>

        <div>
          <label
            htmlFor="entry-date"
            className="block text-xs font-medium text-gray-700"
          >
            Date
          </label>
          <input
            id="entry-date"
            name="date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="sm:col-span-2 lg:col-span-1">
          <span aria-hidden="true" className="block text-xs font-medium opacity-0">
            Add
          </span>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto"
          >
            {busy ? "Adding…" : "Add entry"}
          </button>
        </div>
      </div>
    </form>
  );
}
