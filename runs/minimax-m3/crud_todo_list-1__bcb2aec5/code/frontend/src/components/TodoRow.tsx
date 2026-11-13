import { useState } from "react";
import type { FormEvent } from "react";
import { formatDate, isOverdue, PRIORITY_OPTIONS, priorityBadgeClass, priorityLabel } from "../lib/format";
import type { Todo, TodoInput } from "../types";

type Props = {
  todo: Todo;
  onToggle: (todo: Todo) => Promise<void>;
  onUpdate: (id: number, patch: TodoInput) => Promise<void>;
  onDelete: (todo: Todo) => Promise<void>;
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

const iconButtonClass =
  "rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200";

export function TodoRow({ todo, onToggle, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [title, setTitle] = useState(todo.title);
  const [description, setDescription] = useState(todo.description ?? "");
  const [priority, setPriority] = useState(todo.priority);
  const [dueDate, setDueDate] = useState(todo.due_date ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const overdue = isOverdue(todo);
  const dueLabel = formatDate(todo.due_date);

  const startEditing = () => {
    setTitle(todo.title);
    setDescription(todo.description ?? "");
    setPriority(todo.priority);
    setDueDate(todo.due_date ?? "");
    setError("");
    setConfirming(false);
    setEditing(true);
  };

  const toggle = async () => {
    setBusy(true);
    setError("");
    try {
      await onToggle(todo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the todo.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onUpdate(todo.id, {
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        priority,
        due_date: dueDate ? dueDate : null,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the todo.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await onDelete(todo);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the todo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li
      className={`rounded-xl border bg-white p-4 shadow-sm transition ${
        overdue ? "border-rose-300 bg-rose-50/50" : "border-slate-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={todo.completed}
          disabled={busy}
          onChange={() => void toggle()}
          aria-label={`Mark "${todo.title}" as ${todo.completed ? "open" : "completed"}`}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`font-medium text-slate-900 ${
                todo.completed ? "text-slate-400 line-through" : ""
              }`}
            >
              {todo.title}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${priorityBadgeClass(
                todo.priority,
              )}`}
            >
              {priorityLabel(todo.priority)}
            </span>
            {dueLabel ? (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                  overdue
                    ? "bg-rose-100 text-rose-700 ring-rose-200"
                    : "bg-slate-100 text-slate-600 ring-slate-200"
                }`}
              >
                {overdue ? "Overdue · " : "Due "}
                {dueLabel}
              </span>
            ) : null}
          </div>
          {todo.description ? (
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{todo.description}</p>
          ) : null}
        </div>

        {!editing ? (
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={startEditing} className={iconButtonClass}>
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(true);
                setError("");
              }}
              className={`${iconButtonClass} hover:bg-rose-50 hover:text-rose-600`}
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>

      {confirming && !editing ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
          <span className="text-sm text-rose-700">Delete this todo permanently?</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <form onSubmit={save} className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div>
            <label htmlFor={`title-${todo.id}`} className="mb-1 block text-xs font-medium text-slate-600">
              Title
            </label>
            <input
              id={`title-${todo.id}`}
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label
              htmlFor={`description-${todo.id}`}
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              Description
            </label>
            <textarea
              id={`description-${todo.id}`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor={`priority-${todo.id}`}
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                Priority
              </label>
              <select
                id={`priority-${todo.id}`}
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                className={inputClass}
              >
                {PRIORITY_OPTIONS.includes(priority as (typeof PRIORITY_OPTIONS)[number]) ? null : (
                  <option value={priority}>{priorityLabel(priority)}</option>
                )}
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {priorityLabel(option)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor={`due-${todo.id}`}
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                Due date
              </label>
              <input
                id={`due-${todo.id}`}
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-rose-600">
          {error}
        </p>
      ) : null}
    </li>
  );
}
