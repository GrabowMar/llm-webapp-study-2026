import { useState } from "react";

import { ApiError, api } from "../api";
import type { CalendarEvent } from "../types";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  event: CalendarEvent;
  onCancel: () => void;
  onConfirmed: () => void;
}

export function ConfirmDialog({ event, onCancel, onConfirmed }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteEvent(event.id);
      onConfirmed();
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      } else {
        setError("The event could not be deleted. Please try again.");
      }
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Delete event"
      onClose={onCancel}
      widthClass="max-w-md"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Deleting..." : "Delete event"}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-700">
        Are you sure you want to delete <span className="font-semibold">{event.title}</span>? This
        cannot be undone.
      </p>
      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
    </Modal>
  );
}
