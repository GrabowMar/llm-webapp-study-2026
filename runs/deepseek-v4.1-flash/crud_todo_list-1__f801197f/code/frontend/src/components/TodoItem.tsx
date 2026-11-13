import { useState } from "react";
import {
  ApiError,
  deleteTodo,
  updateTodo,
  type Todo,
  type TodoInput,
} from "../api";

export const PRIORITIES = ["low", "medium", "high"] as const;

export function priorityClasses(priority: string): string {
  switch (priority.toLowerCase()) {
    case "high":
      return "bg-red-100 text-red-700 ring-red-200";
    case "low":
      return "bg-emerald-100 text-emerald-700 ring-emerald-200";
    case "medium":
      return "bg-amber-100 text-amber-700 ring-amber-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

function isOverdue(todo: Todo): boolean {
  return !todo.completed && Boolean(todo.due_date) && todo.due_date! < todayIso();
}

function formatDate(value: string | null): string {
  if (!value) {
    return "";
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface Props {
  todo: Todo;
  onChanged: (todo: Todo) => void;
  onDeleted: (id: number) => void;
  onUnauthorized: () => void;
}

interface Draft {
  title: string;
  description: string;
  priority: string;
  due_date: string;
}

function toDraft(todo: Todo): Draft {
  return {
    title: todo.title,
    description: todo.description ?? "",
    priority: todo.priority,
    due_date: todo.due_date ?? "",
  };
}

export default function TodoItem({ todo, onChanged, onDeleted, onUnauthorized }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(toDraft(todo));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const overdue = isOverdue(todo);

  function handleError(error: unknown) {
    if (error instanceof ApiError) {
      if (error.status === 401) {
        onUnauthorized();
        return;
      }
      setFormError(error.message);
      setFieldErrors(error.fields);
    } else {
      setFormError("Something went wrong. Please try again.");
    }
  }

  async function toggleCompleted() {
    setBusy(true);
    setFormError("");
    try {
      const updated = await updateTodo(todo.id, { completed: !todo.completed });
      onChanged(updated);
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  function startEditing() {
    setDraft(toDraft(todo));
    setFieldErrors({});
    setFormError("");
    setEditing(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    setFieldErrors({});
    const payload: TodoInput = {
      title: draft.title,
      description: draft.description.trim() ? draft.description : null,
      priority: draft.priority,
      due_date: draft.due_date ? draft.due_date : null,
    };
    try {
      const updated = await updateTodo(todo.id, payload);
      onChanged(updated);
      setEditing(false);
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const confirmed = window.confirm(`Delete “${todo.title}”? This cannot be undone.`);
    if (!confirmed) {
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      await deleteTodo(todo.id);
      onDeleted(todo.id);
    } catch (error) {
      handleError(error);
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm">
        <form onSubmit={save} className="space-y-3" noValidate>
          {formError && (
            <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
              {formError}
            </p>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
            <input
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            {fieldErrors.title && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Description
            </label>
            <textarea
              rows={2}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            {fieldErrors.description && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.description}</p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Priority
              </label>
              <select
                value={draft.priority}
                onChange={(event) => setDraft({ ...draft, priority: event.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
              {fieldErrors.priority && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.priority}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Due date
              </label>
              <input
                type="date"
                value={draft.due_date}
                onChange={(event) => setDraft({ ...draft, due_date: event.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
              {fieldErrors.due_date && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.due_date}</p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li
      className={`rounded-xl border bg-white p-4 shadow-sm transition ${
        overdue ? "border-red-300 bg-red-50/40" : "border-slate-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={toggleCompleted}
          disabled={busy}
          aria-label={`Mark ${todo.title} as ${todo.completed ? "open" : "completed"}`}
          className="mt-1 h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`break-words text-sm font-semibold ${
                todo.completed ? "text-slate-400 line-through" : "text-slate-900"
              }`}
            >
              {todo.title}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${priorityClasses(
                todo.priority,
              )}`}
            >
              {todo.priority}
            </span>
            {overdue && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                Overdue
              </span>
            )}
          </div>

          {todo.description && (
            <p
              className={`mt-1 whitespace-pre-wrap break-words text-sm ${
                todo.completed ? "text-slate-400" : "text-slate-600"
              }`}
            >
              {todo.description}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            {todo.due_date && (
              <span className={overdue ? "font-semibold text-red-600" : ""}>
                Due {formatDate(todo.due_date)}
              </span>
            )}
            <span>Added {formatDate(todo.created_at.slice(0, 10))}</span>
            {todo.completed && todo.completed_at && (
              <span>Completed {formatDate(todo.completed_at.slice(0, 10))}</span>
            )}
          </div>

          {formError && (
            <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
              {formError}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={startEditing}
            disabled={busy}
            className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-60"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}
