import { FormEvent, useState } from "react";
import {
  ApiError,
  CalendarEvent,
  createEvent,
  updateEvent,
} from "../lib/api";
import { MS_PER_HOUR, toInputValue } from "../lib/datetime";

interface Props {
  mode: "create" | "edit";
  event?: CalendarEvent;
  defaultStart?: Date;
  onClose: () => void;
  onSaved: (event: CalendarEvent) => void;
}

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function EventFormModal({
  mode,
  event,
  defaultStart,
  onClose,
  onSaved,
}: Props) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [startTime, setStartTime] = useState(() =>
    event
      ? toInputValue(new Date(event.start_time))
      : toInputValue(defaultStart ?? new Date()),
  );
  const [endTime, setEndTime] = useState(() => {
    if (event) {
      return toInputValue(new Date(event.end_time));
    }
    const start = defaultStart ?? new Date();
    return toInputValue(new Date(start.getTime() + MS_PER_HOUR));
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      title,
      description: description.trim() ? description : null,
      location: location.trim() ? location : null,
      start_time: startTime,
      end_time: endTime,
    };
    try {
      const saved =
        mode === "create"
          ? await createEvent(payload)
          : await updateEvent(event!.id, payload);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Your session expired. Please sign in again.");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  }

  const isEdit = mode === "edit";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Edit event form" : "New event form"}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {isEdit ? "Edit event" : "New event"}
          </h2>
          <button
            type="button"
            aria-label="Close event form"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="event-title"
              className="block text-sm font-medium text-slate-700"
            >
              Title
            </label>
            <input
              id="event-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={inputClass}
              placeholder="Team standup"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="event-start"
                className="block text-sm font-medium text-slate-700"
              >
                Starts (UTC)
              </label>
              <input
                id="event-start"
                type="datetime-local"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="event-end"
                className="block text-sm font-medium text-slate-700"
              >
                Ends (UTC)
              </label>
              <input
                id="event-end"
                type="datetime-local"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="event-location"
              className="block text-sm font-medium text-slate-700"
            >
              Location
            </label>
            <input
              id="event-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className={inputClass}
              placeholder="Optional"
            />
          </div>

          <div>
            <label
              htmlFor="event-description"
              className="block text-sm font-medium text-slate-700"
            >
              Description
            </label>
            <textarea
              id="event-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className={inputClass}
              placeholder="Optional"
            />
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? "Saving…" : isEdit ? "Save changes" : "Create event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
