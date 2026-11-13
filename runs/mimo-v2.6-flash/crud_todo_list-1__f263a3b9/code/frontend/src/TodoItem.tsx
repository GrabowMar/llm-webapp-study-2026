import { useState } from "react";
import {
  errorMessage,
  type Priority,
  type Todo,
  type TodoDraft,
} from "./api";

interface Props {
  todo: Todo;
  onToggle: (todo: Todo) => Promise<void>;
  onSave: (todo: Todo, draft: TodoDraft) => Promise<void>;
  onDelete: (todo: Todo) => Promise<void>;
}

const PRIORITIES: Priority[] = ["low", "medium", "high"];

const PRIORITY_STYLES: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

function localToday(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default function TodoItem({ todo, onToggle, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(todo.title);
  const [description, setDescription] = useState(todo.description ?? "");
  const [priority, setPriority] = useState<Priority>(todo.priority);
  const [dueDate, setDueDate] = useState(todo.due_date ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overdue =
    !todo.completed && todo.due_date !== null && todo.due_date < localToday();

  function startEditing() {
    setTitle(todo.title);
    setDescription(todo.description ?? "");
    setPriority(todo.priority);
    setDueDate(todo.due_date ?? "");
    setError(null);
    setEditing(true);
  }

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await onToggle(todo);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave(todo, {
        title,
        description: description.trim() || null,
        priority,
        due_date: dueDate || null,
      });
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  async function remove() {
    if (!window.confirm(`Delete "${todo.title}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(todo);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={`rounded-lg border p-3 shadow-sm transition ${
        overdue ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
      } ${busy ? "opacity-60" : ""}`}
    >
      {editing ? (
        <div className="space-y-3">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Title"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            aria-label="Description"
            rows={2}
            placeholder="Description (optional)"
            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor={`priority-${todo.id}`}
                className="mb-1 block text-xs font-medium text-slate-500"
              >
                Priority
              </label>
              <select
                id={`priority-${todo.id}`}
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as Priority)
                }
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor={`due-${todo.id}`}
                className="mb-1 block text-xs font-medium text-slate-500"
              >
                Due date
              </label>
              <input
                id={`due-${todo.id}`}
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={toggle}
              disabled={busy}
              aria-label={`Mark "${todo.title}" as ${
                todo.completed ? "open" : "completed"
              }`}
              className="mt-1 h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`break-words text-sm font-medium ${
                    todo.completed
                      ? "text-slate-400 line-through"
                      : "text-slate-800"
                  }`}
                >
                  {todo.title}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PRIORITY_STYLES[todo.priority]}`}
                >
                  {todo.priority}
                </span>
              </div>
              {todo.description && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">
                  {todo.description}
                </p>
              )}
              {todo.due_date && (
                <p
                  className={`mt-1 text-xs ${
                    overdue ? "font-semibold text-red-600" : "text-slate-400"
                  }`}
                >
                  Due {todo.due_date}
                  {overdue ? " · Overdue" : ""}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={startEditing}
                disabled={busy}
                aria-label={`Edit "${todo.title}"`}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                aria-label={`Delete "${todo.title}"`}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
          {error && (
            <p className="mt-2 text-sm font-medium text-red-600">{error}</p>
          )}
        </div>
      )}
    </li>
  );
}
