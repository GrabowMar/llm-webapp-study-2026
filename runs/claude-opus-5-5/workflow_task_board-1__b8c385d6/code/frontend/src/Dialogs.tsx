import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, PRIORITIES, STATUSES, type Priority, type Status, type Task, type TaskInput } from "./api";

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
      >
        <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>
        {children}
      </div>
    </div>
  );
}

interface TaskDialogProps {
  mode: "create" | "edit";
  task?: Task;
  defaultStatus?: Status;
  onSubmit: (input: TaskInput) => Promise<void>;
  onClose: () => void;
}

export function TaskDialog({ mode, task, defaultStatus = "todo", onSubmit, onClose }: TaskDialogProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
  const [status, setStatus] = useState<Status>(task?.status ?? defaultStatus);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const input: TaskInput = {};
    if (mode === "create") {
      Object.assign(input, { title, description, priority, status });
    } else if (task) {
      if (title !== task.title) input.title = title;
      if (description !== task.description) input.description = description;
      if (priority !== task.priority) input.priority = priority;
      if (status !== task.status) input.status = status;
    }
    try {
      if (mode === "edit" && Object.keys(input).length === 0) {
        onClose();
        return;
      }
      await onSubmit(input);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors);
      } else {
        setError("Something went wrong.");
      }
      setBusy(false);
    }
  };

  const inputClass =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none";

  return (
    <Modal title={mode === "create" ? "New task" : "Edit task"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <div>
          <label htmlFor="task-title" className="mb-1 block text-sm font-medium text-slate-700">
            Title
          </label>
          <input
            id="task-title"
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
          {fieldErrors.title && <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>}
        </div>
        <div>
          <label htmlFor="task-description" className="mb-1 block text-sm font-medium text-slate-700">
            Description
          </label>
          <textarea
            id="task-description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
          {fieldErrors.description && <p className="mt-1 text-xs text-red-600">{fieldErrors.description}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="task-priority" className="mb-1 block text-sm font-medium text-slate-700">
              Priority
            </label>
            <select
              id="task-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className={inputClass}
            >
              {PRIORITIES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            {fieldErrors.priority && <p className="mt-1 text-xs text-red-600">{fieldErrors.priority}</p>}
          </div>
          <div>
            <label htmlFor="task-status" className="mb-1 block text-sm font-medium text-slate-700">
              Column
            </label>
            <select
              id="task-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className={inputClass}
            >
              {STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            {fieldErrors.status && <p className="mt-1 text-xs text-red-600">{fieldErrors.status}</p>}
          </div>
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : mode === "create" ? "Create task" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ConfirmDeleteDialog({
  task,
  onConfirm,
  onClose,
}: {
  task: Task;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <Modal title="Delete task" onClose={onClose}>
      <p className="text-sm text-slate-700">
        Delete <span className="font-semibold">“{task.title}”</span>? This cannot be undone.
      </p>
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={busy}
          className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </Modal>
  );
}
