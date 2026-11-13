import { useState, type FormEvent } from "react";
import { ApiError, api } from "../api";
import { COLUMNS, PRIORITIES } from "../lib/board";
import type { Priority, Status, Task } from "../types";
import { Modal } from "./Modal";

interface TaskDialogProps {
  mode: "create" | "edit";
  task?: Task;
  defaultStatus?: Status;
  onClose: () => void;
  onSaved: (task: Task) => void;
}

export function TaskDialog({ mode, task, defaultStatus = "todo", onClose, onSaved }: TaskDialogProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<Status>(task?.status ?? defaultStatus);
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      if (mode === "create") {
        const created = await api.createTask({
          title,
          description,
          status,
          priority,
        });
        onSaved(created);
      } else if (task) {
        const payload: Partial<Omit<Task, "id" | "updated_at">> = {};
        if (title !== task.title) payload.title = title;
        if (description !== task.description) payload.description = description;
        if (status !== task.status) payload.status = status;
        if (priority !== task.priority) payload.priority = priority;
        if (Object.keys(payload).length === 0) {
          onClose();
          return;
        }
        const updated = await api.updateTask(task.id, payload);
        onSaved(updated);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors);
      } else {
        setError("Something went wrong, please try again");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={mode === "create" ? "New task" : "Edit task"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Title</span>
          <input
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What needs to be done?"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
          />
          {fieldErrors.title ? (
            <span className="mt-1 block text-xs text-red-600">{fieldErrors.title}</span>
          ) : null}
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Description</span>
          <textarea
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="Add more detail (optional)"
            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
          />
          {fieldErrors.description ? (
            <span className="mt-1 block text-xs text-red-600">{fieldErrors.description}</span>
          ) : null}
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Column</span>
            <select
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value as Status)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
            >
              {COLUMNS.map((column) => (
                <option key={column.status} value={column.status}>
                  {column.label}
                </option>
              ))}
            </select>
            {fieldErrors.status ? (
              <span className="mt-1 block text-xs text-red-600">{fieldErrors.status}</span>
            ) : null}
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Priority</span>
            <select
              name="priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value as Priority)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
            >
              {PRIORITIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {fieldErrors.priority ? (
              <span className="mt-1 block text-xs text-red-600">{fieldErrors.priority}</span>
            ) : null}
          </label>
        </div>

        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Saving…" : mode === "create" ? "Create task" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
