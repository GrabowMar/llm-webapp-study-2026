import { useState } from "react";
import { ApiError, deleteEvent, type CalendarEvent } from "../api";
import { formatDateTime, formatTime } from "../date";
import Modal from "./Modal";

interface EventDetailsProps {
  event: CalendarEvent;
  signedIn: boolean;
  onEdit: () => void;
  onDeleted: () => void;
  onClose: () => void;
}

export default function EventDetails({
  event,
  signedIn,
  onEdit,
  onDeleted,
  onClose,
}: EventDetailsProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const handleDelete = async () => {
    setBusy(true);
    setMessage("");
    try {
      await deleteEvent(event.id);
      onDeleted();
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : "Could not delete the event. Please try again.",
      );
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <Modal
      title="Event details"
      onClose={onClose}
      footer={
        signedIn ? (
          confirming ? (
            <>
              <span className="mr-auto text-sm font-medium text-slate-700">
                Delete this event?
              </span>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {busy ? "Deleting…" : "Confirm delete"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="mr-auto rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                Edit
              </button>
            </>
          )
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        )
      }
    >
      {message && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {message}
        </div>
      )}
      <h3 className="text-xl font-semibold text-slate-900">{event.title}</h3>
      <dl className="mt-5 space-y-4 text-sm">
        <div>
          <dt className="font-medium text-slate-500">When</dt>
          <dd className="mt-0.5 text-slate-900">
            {formatDateTime(event.start_time)} – {formatDateTime(event.end_time)}
            <span className="ml-1 text-slate-400">
              ({formatTime(event.start_time)}–{formatTime(event.end_time)})
            </span>
          </dd>
        </div>
        {event.location && (
          <div>
            <dt className="font-medium text-slate-500">Location</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-slate-900">
              {event.location}
            </dd>
          </div>
        )}
        {event.description && (
          <div>
            <dt className="font-medium text-slate-500">Description</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-slate-900">
              {event.description}
            </dd>
          </div>
        )}
        <div className="border-t border-slate-100 pt-3 text-xs text-slate-400">
          Created by {event.created_by} on {formatDateTime(event.created_at)}
        </div>
      </dl>
    </Modal>
  );
}
