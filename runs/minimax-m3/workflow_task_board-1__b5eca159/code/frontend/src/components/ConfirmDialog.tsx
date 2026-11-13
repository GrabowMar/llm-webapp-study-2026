import { useState } from "react";
import { ApiError, api } from "../api";
import type { Task } from "../types";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  task: Task;
  onClose: () => void;
  onDeleted: (task: Task) => void;
}

export function ConfirmDialog({ task, onClose, onDeleted }: ConfirmDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteTask(task.id);
      onDeleted(task);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the task");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Delete task"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        Delete <span className="font-semibold text-slate-900">{task.title}</span>? This cannot be
        undone.
      </p>
      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
