import { formatDateTime, formatTimeRange } from "../lib/dates";
import type { CalendarEvent } from "../types";
import { Modal } from "./Modal";

interface EventDetailsModalProps {
  event: CalendarEvent;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function EventDetailsModal({
  event,
  canEdit,
  onClose,
  onEdit,
  onDelete,
}: EventDetailsModalProps) {
  return (
    <Modal
      title="Event details"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
          {canEdit ? (
            <>
              <button
                type="button"
                onClick={onDelete}
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Edit
              </button>
            </>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{event.title}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {formatTimeRange(event.start_time, event.end_time)} UTC
          </p>
          <p className="text-sm text-slate-600">{formatDateTime(event.start_time)}</p>
        </div>

        <dl className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</dt>
            <dd className="mt-0.5 text-slate-800">{event.location || "Not set"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Created by</dt>
            <dd className="mt-0.5 text-slate-800">{event.created_by}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Created</dt>
            <dd className="mt-0.5 text-slate-800">{formatDateTime(event.created_at)}</dd>
          </div>
        </dl>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</h4>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
            {event.description || "No description provided."}
          </p>
        </div>
      </div>
    </Modal>
  );
}
