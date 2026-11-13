import { useState, type FormEvent } from "react";
import { ApiError } from "../api";
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  STATUS_LABELS,
  STATUS_ORDER,
  type Priority,
  type Status,
  type Task,
  type TaskValues,
} from "../types";
import {
  FieldError,
  FormError,
  Modal,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "./Modal";

interface TaskDialogProps {
  mode: "create" | "edit";
  task: Task | null;
  defaultStatus: Status;
  onSubmit: (values: TaskValues) => Promise<void>;
  onDelete: (task: Task) => void;
  onClose: () => void;
}

export function TaskDialog({ mode, task, defaultStatus, onSubmit, onDelete, onClose }: TaskDialogProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<Status>(task?.status ?? defaultStatus);
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const isEdit = mode === "edit";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await onSubmit({ title, description, status, priority });
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        setFieldErrors(err.fields);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return (
    <Modal title={isEdit ? "Edit task" : "New task"} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={formError} />
        <div>
          <label htmlFor="task-title" className="mb-1 block text-sm font-medium text-slate-700">
            Title
          </label>
          <input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            className={inputClass}
          />
          <FieldError name="title" errors={fieldErrors} />
        </div>
        <div>
          <label htmlFor="task-description" className="mb-1 block text-sm font-medium text-slate-700">
            Description
          </label>
          <textarea
            id="task-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={inputClass}
          />
          <FieldError name="description" errors={fieldErrors} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="task-status" className="mb-1 block text-sm font-medium text-slate-700">
              Status
            </label>
            <select
              id="task-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className={inputClass}
            >
              {STATUS_ORDER.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
            <FieldError name="status" errors={fieldErrors} />
          </div>
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
              {PRIORITY_ORDER.map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value]}
                </option>
              ))}
            </select>
            <FieldError name="priority" errors={fieldErrors} />
          </div>
        </div>
        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={primaryButtonClass}>
              {busy ? "Saving\u2026" : isEdit ? "Save changes" : "Create task"}
            </button>
            <button type="button" onClick={onClose} className={secondaryButtonClass}>
              Cancel
            </button>
          </div>
          {isEdit && task && (
            <button
              type="button"
              onClick={() => onDelete(task)}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
