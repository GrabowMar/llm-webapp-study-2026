import { useState } from "react";
import { ApiError, createTodo } from "./api";
import type { Priority, Todo, TodoInput } from "./types";

interface Props {
  onCreated: (todo: Todo) => void;
}

const EMPTY: TodoInput = { title: "", description: "", priority: "medium", due_date: "" };

const priorityOptions: { value: Priority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export default function AddTodoForm({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TodoInput>({ ...EMPTY });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function update<K extends keyof TodoInput>(key: K, value: TodoInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setErrors({});
    setBusy(true);
    try {
      const todo = await createTodo({
        title: draft.title,
        description: draft.description?.trim() || null,
        priority: draft.priority,
        due_date: draft.due_date || null,
      });
      onCreated(todo);
      setDraft({ ...EMPTY });
      setOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        setMessage(err.message);
      } else {
        setMessage("Could not reach the server. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
      >
        + Add a todo
      </button>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">New todo</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-400 hover:text-slate-700">
          Cancel
        </button>
      </div>

      <div className="space-y-4">
        <Field label="Title" error={errors.title}>
          <input
            type="text"
            value={draft.title}
            onChange={(event) => update("title", event.target.value)}
            placeholder="What needs to be done?"
            className={inputClass(!!errors.title)}
          />
        </Field>

        <Field label="Description (optional)" error={errors.description}>
          <textarea
            value={draft.description ?? ""}
            onChange={(event) => update("description", event.target.value)}
            rows={2}
            placeholder="Add some detail…"
            className={inputClass(!!errors.description)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Priority" error={errors.priority}>
            <select
              value={draft.priority}
              onChange={(event) => update("priority", event.target.value as Priority)}
              className={inputClass(!!errors.priority)}
            >
              {priorityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Due date (optional)" error={errors.due_date}>
            <input
              type="date"
              value={draft.due_date ?? ""}
              onChange={(event) => update("due_date", event.target.value)}
              className={inputClass(!!errors.due_date)}
            />
          </Field>
        </div>
      </div>

      {message && (
        <div role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {message}
          {Object.entries(errors)
            .filter(([key]) => !["title", "description", "priority", "due_date"].includes(key))
            .map(([key, value]) => (
              <li key={key}>{value}</li>
            ))}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-5 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
      >
        {busy ? "Saving…" : "Add todo"}
      </button>
    </form>
  );
}

export function inputClass(hasError: boolean): string {
  return `mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
    hasError
      ? "border-red-400 focus:border-red-500 focus:ring-red-200"
      : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-200"
  }`;
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
