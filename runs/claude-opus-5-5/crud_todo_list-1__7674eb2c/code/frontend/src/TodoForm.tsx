import { useState, type FormEvent } from "react";
import { ApiError, PRIORITIES, type FieldErrors, type Priority, type Todo, type TodoInput } from "./api";

interface Props {
  initial?: Todo;
  submitLabel: string;
  onSubmit: (input: TodoInput) => Promise<void>;
  onCancel?: () => void;
  resetOnSuccess?: boolean;
}

const inputClass =
  "w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none";

function fieldClass(hasError: boolean) {
  return `${inputClass} ${
    hasError
      ? "border-red-400 focus:border-red-500 focus:ring-red-200"
      : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-200"
  }`;
}

export default function TodoForm({ initial, submitLabel, onSubmit, onCancel, resetOnSuccess }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(initial?.due_date ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idPrefix = initial ? `edit-${initial.id}` : "new";

  function buildInput(): TodoInput {
    const values: TodoInput = {
      title,
      description: description === "" ? null : description,
      priority,
      due_date: dueDate === "" ? null : dueDate,
    };
    if (!initial) return values;
    const changed: TodoInput = {};
    if (values.title !== initial.title) changed.title = values.title;
    if (values.description !== initial.description) changed.description = values.description;
    if (values.priority !== initial.priority) changed.priority = values.priority;
    if (values.due_date !== initial.due_date) changed.due_date = values.due_date;
    return changed;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      await onSubmit(buildInput());
      if (resetOnSuccess) {
        setTitle("");
        setDescription("");
        setPriority("medium");
        setDueDate("");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        if (Object.keys(err.errors).length === 0) setError(err.message);
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3" aria-label={initial ? "Edit todo" : "Add todo"}>
      <div>
        <label htmlFor={`${idPrefix}-title`} className="sr-only">
          Title
        </label>
        <input
          id={`${idPrefix}-title`}
          name="title"
          placeholder="What needs to be done?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={fieldClass(!!errors.title)}
          aria-invalid={!!errors.title}
        />
        {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title}</p>}
      </div>
      <div>
        <label htmlFor={`${idPrefix}-description`} className="sr-only">
          Description
        </label>
        <textarea
          id={`${idPrefix}-description`}
          name="description"
          placeholder="Description (optional)"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={fieldClass(!!errors.description)}
          aria-invalid={!!errors.description}
        />
        {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description}</p>}
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <label htmlFor={`${idPrefix}-priority`} className="mb-1 block text-xs font-medium text-slate-500">
            Priority
          </label>
          <select
            id={`${idPrefix}-priority`}
            name="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className={fieldClass(!!errors.priority)}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p[0].toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
          {errors.priority && <p className="mt-1 text-sm text-red-600">{errors.priority}</p>}
        </div>
        <div>
          <label htmlFor={`${idPrefix}-due`} className="mb-1 block text-xs font-medium text-slate-500">
            Due date
          </label>
          <input
            id={`${idPrefix}-due`}
            name="due_date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={fieldClass(!!errors.due_date)}
            aria-invalid={!!errors.due_date}
          />
          {errors.due_date && <p className="mt-1 text-sm text-red-600">{errors.due_date}</p>}
        </div>
        <div className="ml-auto flex gap-2 self-end">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
