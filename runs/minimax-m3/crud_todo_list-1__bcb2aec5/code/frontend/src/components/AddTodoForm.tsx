import { useState } from "react";
import type { FormEvent } from "react";
import { PRIORITY_OPTIONS, priorityLabel } from "../lib/format";
import type { TodoInput } from "../types";

type Props = {
  onCreate: (input: TodoInput) => Promise<void>;
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

export function AddTodoForm({ onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("medium");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        priority,
        due_date: dueDate ? dueDate : null,
      });
      setTitle("");
      setDescription("");
      setDueDate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the todo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="new-title" className="mb-1 block text-xs font-medium text-slate-600">
            Title
          </label>
          <input
            id="new-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What needs to be done?"
            className={inputClass}
          />
        </div>

        <div className="sm:w-36">
          <label htmlFor="new-priority" className="mb-1 block text-xs font-medium text-slate-600">
            Priority
          </label>
          <select
            id="new-priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            className={inputClass}
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {priorityLabel(option)}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:w-44">
          <label htmlFor="new-due" className="mb-1 block text-xs font-medium text-slate-600">
            Due date
          </label>
          <input
            id="new-due"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {busy ? "Adding…" : "Add todo"}
          </button>
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor="new-description" className="mb-1 block text-xs font-medium text-slate-600">
          Description <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          id="new-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          placeholder="Add any details…"
          className={inputClass}
        />
      </div>

      {error ? (
        <p role="alert" className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </form>
  );
}
