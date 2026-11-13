import { useState, type FormEvent } from "react";
import { ApiError, api, type CalendarEvent } from "../api";
import { localInputToIso, toLocalInputValue } from "../dates";
import Modal from "./Modal";

interface EventFormProps {
  event?: CalendarEvent;
  defaultStart?: Date;
  onClose: () => void;
  onSaved: (event: CalendarEvent) => void;
}

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 aria-[invalid=true]:border-red-500";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="mt-1 block text-xs font-normal text-red-600">{message}</span>;
}

export default function EventForm({ event, defaultStart, onClose, onSaved }: EventFormProps) {
  const initialStart = event ? new Date(event.start_time) : (defaultStart ?? new Date());
  const initialEnd = event ? new Date(event.end_time) : new Date(initialStart.getTime() + 60 * 60 * 1000);

  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [start, setStart] = useState(toLocalInputValue(initialStart));
  const [end, setEnd] = useState(toLocalInputValue(initialEnd));
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const onStartChange = (value: string) => {
    const prevStart = new Date(start).getTime();
    const prevEnd = new Date(end).getTime();
    const nextStart = new Date(value).getTime();
    setStart(value);
    if (!Number.isNaN(prevStart) && !Number.isNaN(prevEnd) && !Number.isNaN(nextStart)) {
      const duration = prevEnd - prevStart;
      if (duration > 0) setEnd(toLocalInputValue(new Date(nextStart + duration)));
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const input = {
      title,
      description: description.trim() ? description : null,
      location: location.trim() ? location : null,
      start_time: localInputToIso(start),
      end_time: localInputToIso(end),
    };
    try {
      const saved = event ? await api.updateEvent(event.id, input) : await api.createEvent(input);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <Modal title={event ? "Edit event" : "New event"} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <label className="block text-sm font-medium text-slate-700">
          Title <span className="text-red-500">*</span>
          <input
            name="title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={!!fieldErrors.title}
            className={inputClass}
          />
          <FieldError message={fieldErrors.title} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Starts <span className="text-red-500">*</span>
            <input
              name="start_time"
              type="datetime-local"
              value={start}
              onChange={(e) => onStartChange(e.target.value)}
              aria-invalid={!!fieldErrors.start_time}
              className={inputClass}
            />
            <FieldError message={fieldErrors.start_time} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Ends <span className="text-red-500">*</span>
            <input
              name="end_time"
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              aria-invalid={!!fieldErrors.end_time}
              className={inputClass}
            />
            <FieldError message={fieldErrors.end_time} />
          </label>
        </div>
        <p className="-mt-2 text-xs text-slate-500">Times are in your local time zone ({tz}).</p>
        <label className="block text-sm font-medium text-slate-700">
          Location
          <input
            name="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            aria-invalid={!!fieldErrors.location}
            className={inputClass}
          />
          <FieldError message={fieldErrors.location} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Description
          <textarea
            name="description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-invalid={!!fieldErrors.description}
            className={inputClass}
          />
          <FieldError message={fieldErrors.description} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
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
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Saving…" : event ? "Save changes" : "Create event"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
