import { useState } from "react";
import { ApiError, deleteTodo, patchTodo } from "./api";
import { Field, inputClass } from "./AddTodoForm";
import type { Priority, Todo, TodoInput } from "./types";

interface Props {
  todo: Todo;
  onUpdated: (todo: Todo) => void;
  onDeleted: (id: number) => void;
}

const priorityStyles: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-600 ring-slate-200",
  medium: "bg-amber-50 text-amber-700 ring-amber-200",
  high: "bg-rose-50 text-rose-700 ring-rose-200",
};

export function isOverdue(todo: Todo): boolean {
  if (!todo.due_date || todo.completed) return false;
  const due = new Date(todo.due_date);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function TodoRow({ todo, onUpdated, onDeleted }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TodoInput>({
    title: todo.title,
    description: todo.description ?? "",
    priority: todo.priority,
    due_date: todo.due_date ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const overdue = isOverdue(todo);

  function update<K extends keyof TodoInput>(key: K, value: TodoInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function startEditing() {
    setDraft({
      title: todo.title,
      description: todo.description ?? "",
      priority: todo.priority,
      due_date: todo.due_date ?? "",
    });
    setErrors({});
    setMessage("");
    setEditing(true);
    setConfirming(false);
  }

  async function toggleCompleted() {
    setBusy(true);
    setMessage("");
    try {
      onUpdated(await patchTodo(todo.id, { completed: !todo.completed }));
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not save the change.");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setMessage("");
    setBusy(true);
    try {
      onUpdated(
        await patchTodo(todo.id, {
          title: draft.title,
          description: draft.description?.trim() || null,
          priority: draft.priority,
          due_date: draft.due_date || null,
        }),
      );
      setEditing(false);
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

  async function remove() {
    setBusy(true);
    setMessage("");
    try {
      await deleteTodo(todo.id);
      onDeleted(todo.id);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not delete the todo.");
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <li
      className={`rounded-xl border bg-white p-4 shadow-sm transition ${
        overdue ? "border-red-300 bg-red-50/60 ring-1 ring-red-200" : "border-slate-200"
      }`}
    >
      {editing ? (
        <form onSubmit={save} noValidate className="space-y-4">
          <Field label="Title" error={errors.title}>
            <input
              type="text"
              value={draft.title}
              onChange={(event) => update("title", event.target.value)}
              className={inputClass(!!errors.title)}
            />
          </Field>
          <Field label="Description (optional)" error={errors.description}>
            <textarea
              value={draft.description ?? ""}
              onChange={(event) => update("description", event.target.value)}
              rows={2}
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
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
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

          {message && (
            <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
              {message}
              {Object.entries(errors)
                .filter(([key]) => !["title", "description", "priority", "due_date"].includes(key))
                .map(([key, value]) => (
                  <p key={key}>{value}</p>
                ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={todo.completed}
            onChange={toggleCompleted}
            disabled={busy}
            aria-label={`Mark ${todo.title} as ${todo.completed ? "open" : "completed"}`}
            className="mt-1 size-5 shrink-0 cursor-pointer rounded border-slate-300 accent-indigo-600 disabled:opacity-50"
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
                className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ${priorityStyles[todo.priority]}`}
              >
                {todo.priority}
              </span>
              {overdue && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                  Overdue
                </span>
              )}
            </div>

            {todo.description && (
              <p className={`mt-1 whitespace-pre-wrap break-words text-sm ${todo.completed ? "text-slate-400" : "text-slate-600"}`}>
                {todo.description}
              </p>
            )}

            {todo.due_date && (
              <p className={`mt-2 flex items-center gap-1 text-xs ${overdue ? "font-semibold text-red-600" : "text-slate-500"}`}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
                  <path d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-2.25 6v7.25c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25V8H3.5Z" />
                </svg>
                Due {formatDate(todo.due_date)}
              </p>
            )}

            {message && <p className="mt-2 text-sm text-red-600">{message}</p>}
          </div>

          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={startEditing}
              className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {confirming && !editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-3 ring-1 ring-red-200">
          <span className="text-sm text-red-800">Delete this todo permanently?</span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
