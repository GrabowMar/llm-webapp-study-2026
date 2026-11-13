import { type Event } from "../api";
import { formatDateTime, parseAPI } from "../dates";
import { Modal } from "./Modal";

export default function EventDetailModal({
  event,
  canEdit,
  onEdit,
  onDelete,
  onClose,
}: {
  event: Event;
  canEdit: boolean;
  onEdit: (event: Event) => void;
  onDelete: (event: Event) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Event details" onClose={onClose}>
      <h3 className="text-lg font-semibold text-slate-900">{event.title}</h3>
      <div className="mt-2 space-y-1 text-sm text-slate-600">
        <p>
          <span className="font-medium text-slate-500">When: </span>
          {formatDateTime(parseAPI(event.start_time))}
          {" — "}
          {formatDateTime(parseAPI(event.end_time))}
        </p>
        {event.location && (
          <p>
            <span className="font-medium text-slate-500">Where: </span>
            {event.location}
          </p>
        )}
        {event.description && (
          <p className="whitespace-pre-wrap">
            <span className="font-medium text-slate-500">Description: </span>
            {event.description}
          </p>
        )}
        <p className="text-xs text-slate-400">
          Created {formatDateTime(parseAPI(event.created_at))} by {event.created_by}
        </p>
      </div>
      {canEdit && (
        <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => onDelete(event)}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => onEdit(event)}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Edit
          </button>
        </div>
      )}
    </Modal>
  );
}
