import { useState, type FormEvent } from "react";
import {
  ApiError,
  createTask,
  deleteTask,
  updateTask,
  type Priority,
  type Status,
  type Task,
} from "../api";
import Modal from "./Modal";

export const STATUSES: { value: Status; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

interface TaskDialogProps {
  mode: "create" | "edit";
  task?: Task;
  defaultStatus?: Status;
  onClose: () => void;
  onSaved: () => void;
}

export default function TaskDialog({
  mode,
  task,
  defaultStatus,
  onClose,
  onSaved,
}: TaskDialogProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<Status>(task?.status ?? defaultStatus ?? "todo");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors([]);
    setBusy(true);
    try {
      if (mode === "create") {
        await createTask({ title, description, status, priority });
      } else if (task) {
        await updateTask(task.id, { title, description, status, priority });
      }
      onSaved();
    } catch (error) {
      setErrors(
        error instanceof ApiError ? error.errors : ["Something went wrong"],
      );
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      await deleteTask(task.id);
      onSaved();
    } catch (error) {
      setErrors(
        error instanceof ApiError ? error.errors : ["Something went wrong"],
      );
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

  return (
    <Modal
      title={mode === "create" ? "New task" : "Edit task"}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
        {errors.length > 0 && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {errors.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}
        <div>
          <label
            htmlFor="task-title"
            className="block text-sm font-medium text-slate-700"
          >
            Title
          </label>
          <input
            id="task-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="task-description"
            className="block text-sm font-medium text-slate-700"
          >
            Description
          </label>
          <textarea
            id="task-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="task-status"
              className="block text-sm font-medium text-slate-700"
            >
              Column
            </label>
            <select
              id="task-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as Status)}
              className={inputClass}
            >
              {STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="task-priority"
              className="block text-sm font-medium text-slate-700"
            >
              Priority
            </label>
            <select
              id="task-priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value as Priority)}
              className={inputClass}
            >
              {PRIORITIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <div>
            {mode === "edit" && task && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className={
                  confirmDelete
                    ? "rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                    : "rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                }
              >
                {confirmDelete ? "Click again to delete" : "Delete"}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy ? "Saving…" : mode === "create" ? "Create" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
