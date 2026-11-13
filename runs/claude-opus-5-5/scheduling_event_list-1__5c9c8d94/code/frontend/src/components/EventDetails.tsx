import { useState } from "react";
import { ApiError, api, type CalendarEvent } from "../api";
import { formatDateTime, formatRange } from "../dates";
import Modal from "./Modal";

interface EventDetailsProps {
  event: CalendarEvent;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: (id: number) => void;
}

export default function EventDetails({ event, canEdit, onClose, onEdit, onDeleted }: EventDetailsProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = new Date(event.start_time);
  const end = new Date(event.end_time);

  const doDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteEvent(event.id);
      onDeleted(event.id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        onDeleted(event.id);
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not delete the event.");
      setBusy(false);
    }
  };

  return (
    <Modal title={event.title} onClose={onClose}>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="font-medium text-slate-500">When</dt>
          <dd className="text-slate-900">{formatRange(start, end)}</dd>
        </div>
        {event.location && (
          <div>
            <dt className="font-medium text-slate-500">Location</dt>
            <dd className="whitespace-pre-wrap break-words text-slate-900">{event.location}</dd>
          </div>
        )}
        {event.description && (
          <div>
            <dt className="font-medium text-slate-500">Description</dt>
            <dd className="whitespace-pre-wrap break-words text-slate-900">{event.description}</dd>
          </div>
        )}
        <div>
          <dt className="font-medium text-slate-500">Created</dt>
          <dd className="text-slate-900">
            by <span className="font-medium">{event.created_by}</span> on {formatDateTime(new Date(event.created_at))}
          </dd>
        </div>
      </dl>

      {error && (
        <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {canEdit && !confirming && (
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Edit
          </button>
        </div>
      )}

      {canEdit && confirming && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4" role="alertdialog" aria-label="Confirm delete">
          <p className="text-sm text-red-800">
            Delete <span className="font-semibold">“{event.title}”</span>? This cannot be undone.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={doDelete}
              disabled={busy}
              autoFocus
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-60"
            >
              {busy ? "Deleting…" : "Yes, delete"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
