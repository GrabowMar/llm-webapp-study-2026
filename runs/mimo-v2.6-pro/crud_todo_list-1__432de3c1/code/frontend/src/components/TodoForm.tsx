import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError, toApiError } from "../api";
import type { Priority, Todo, TodoInput } from "../types";

const PRIORITIES: Priority[] = ["high", "medium", "low"];

const inputClass =
  "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

interface TodoFormProps {
  initial?: Partial<Todo>;
  submitLabel: string;
  onSubmit: (input: TodoInput) => Promise<void>;
  onCancel?: () => void;
  resetOnSuccess?: boolean;
}

export default function TodoForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  resetOnSuccess = false,
}: TodoFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(initial?.due_date ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setFieldErrors({});
    const input: TodoInput = {
      title,
      description: description.trim() === "" ? null : description,
      priority,
      due_date: dueDate.trim() === "" ? null : dueDate,
    };
    try {
      await onSubmit(input);
      if (resetOnSuccess) {
        setTitle("");
        setDescription("");
        setPriority("medium");
        setDueDate("");
      }
    } catch (err) {
      const apiError: ApiError = toApiError(err);
      setMessage(apiError.message);
      setFieldErrors(apiError.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded border border-slate-200 bg-white p-4 shadow-sm"
    >
      {message && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}

      <div>
        <label className="block text-sm font-medium text-slate-700">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
          placeholder="What needs to be done?"
        />
        {fieldErrors.title && <p className="mt-1 text-sm text-red-600">{fieldErrors.title}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClass}
          rows={2}
          placeholder="Optional details"
        />
        {fieldErrors.description && (
          <p className="mt-1 text-sm text-red-600">{fieldErrors.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className={inputClass}
          >
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
          {fieldErrors.priority && (
            <p className="mt-1 text-sm text-red-600">{fieldErrors.priority}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Due date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputClass}
          />
          {fieldErrors.due_date && (
            <p className="mt-1 text-sm text-red-600">{fieldErrors.due_date}</p>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
