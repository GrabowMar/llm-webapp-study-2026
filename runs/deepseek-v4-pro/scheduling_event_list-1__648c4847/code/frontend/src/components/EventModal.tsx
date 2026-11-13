import { formatFull } from "../dates";
import { EventItem } from "../api";

export default function EventModal({
  event,
  canEdit,
  onClose,
  onEdit,
  onDelete,
}: {
  event: EventItem;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-xl font-bold text-slate-900">{event.title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <dl className="space-y-3 text-sm">
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 font-medium text-slate-500">Start</dt>
            <dd className="text-slate-800">{formatFull(event.start_time)}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 font-medium text-slate-500">End</dt>
            <dd className="text-slate-800">{formatFull(event.end_time)}</dd>
          </div>
          {event.location && (
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 font-medium text-slate-500">
                Location
              </dt>
              <dd className="text-slate-800">{event.location}</dd>
            </div>
          )}
          {event.description && (
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 font-medium text-slate-500">
                Description
              </dt>
              <dd className="whitespace-pre-wrap text-slate-800">
                {event.description}
              </dd>
            </div>
          )}
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 font-medium text-slate-500">
              Created by
            </dt>
            <dd className="text-slate-800">{event.created_by}</dd>
          </div>
        </dl>

        {canEdit && (
          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={onDelete}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
            <button
              onClick={onEdit}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Edit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
