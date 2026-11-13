import { CalendarEvent } from "../lib/api";
import {
  formatCreatedAt,
  formatEventRange,
} from "../lib/datetime";

interface Props {
  event: CalendarEvent;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function EventDetailsModal({
  event,
  canEdit,
  onEdit,
  onDelete,
  onClose,
}: Props) {
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Event details"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-2xl"
        onClick={(modalEvent) => modalEvent.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-semibold text-slate-900">
            {event.title}
          </h2>
          <button
            type="button"
            aria-label="Close event details"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-slate-500">When</dt>
            <dd className="font-medium text-slate-800">
              {formatEventRange(start, end)}
            </dd>
          </div>
          {event.location && (
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-slate-500">Location</dt>
              <dd className="text-slate-800">{event.location}</dd>
            </div>
          )}
          {event.description && (
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-slate-500">Details</dt>
              <dd className="whitespace-pre-line text-slate-800">
                {event.description}
              </dd>
            </div>
          )}
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-slate-500">Created by</dt>
            <dd className="text-slate-800">{event.created_by}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-slate-500">Created</dt>
            <dd className="text-slate-800">
              {formatCreatedAt(new Date(event.created_at))}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={onDelete}
                className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Edit
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
