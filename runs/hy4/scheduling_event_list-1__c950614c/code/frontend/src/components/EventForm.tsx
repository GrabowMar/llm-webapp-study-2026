import { useState, type FormEvent } from "react";
import {
  ApiError,
  createEvent,
  updateEvent,
  type CalendarEvent,
  type EventInput,
} from "../api";
import { fromInputValue, toInputValue } from "../date";
import Modal from "./Modal";

interface EventFormProps {
  event: CalendarEvent | null;
  defaultStart?: Date;
  onSaved: () => void;
  onClose: () => void;
}

function defaultInputDate(value?: Date): string {
  const date = value ?? new Date();
  const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  return `${key}T${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

export default function EventForm({
  event,
  defaultStart,
  onSaved,
  onClose,
}: EventFormProps) {
  const startSeed = defaultStart ?? new Date(new Date().setUTCHours(9, 0, 0, 0));
  const initialStart = event ? toInputValue(event.start_time) : defaultInputDate(startSeed);
  const endSeed = new Date(startSeed.getTime() + 3_600_000);
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [startTime, setStartTime] = useState(initialStart);
  const [endTime, setEndTime] = useState(
    event ? toInputValue(event.end_time) : defaultInputDate(endSeed),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    setErrors({});
    setMessage("");
    setBusy(true);
    const input: EventInput = {
      title: title.trim(),
      description,
      location,
      start_time: fromInputValue(startTime),
      end_time: fromInputValue(endTime),
    };
    try {
      if (event) {
        await updateEvent(event.id, input);
      } else {
        await createEvent(input);
      }
      onSaved();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.errors);
        setMessage(error.message);
      } else {
        setMessage("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (name: string) =>
    errors[name] ? (
      <p className="mt-1 text-xs text-red-600">{errors[name]}</p>
    ) : null;

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
  const labelClass = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <Modal
      title={event ? "Edit event" : "New event"}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="event-form"
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Saving…" : event ? "Save changes" : "Create event"}
          </button>
        </>
      }
    >
      {message && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {message}
        </div>
      )}
      <form id="event-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="event-title" className={labelClass}>
            Title
          </label>
          <input
            id="event-title"
            type="text"
            value={title}
            onChange={(change) => setTitle(change.target.value)}
            className={inputClass}
            placeholder="Event title"
          />
          {fieldError("title")}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="event-start" className={labelClass}>
              Start (UTC)
            </label>
            <input
              id="event-start"
              type="datetime-local"
              value={startTime}
              onChange={(change) => setStartTime(change.target.value)}
              className={inputClass}
            />
            {fieldError("start_time")}
          </div>
          <div>
            <label htmlFor="event-end" className={labelClass}>
              End (UTC)
            </label>
            <input
              id="event-end"
              type="datetime-local"
              value={endTime}
              onChange={(change) => setEndTime(change.target.value)}
              className={inputClass}
            />
            {fieldError("end_time")}
          </div>
        </div>
        <div>
          <label htmlFor="event-location" className={labelClass}>
            Location
          </label>
          <input
            id="event-location"
            type="text"
            value={location}
            onChange={(change) => setLocation(change.target.value)}
            className={inputClass}
            placeholder="Optional"
          />
          {fieldError("location")}
        </div>
        <div>
          <label htmlFor="event-description" className={labelClass}>
            Description
          </label>
          <textarea
            id="event-description"
            rows={4}
            value={description}
            onChange={(change) => setDescription(change.target.value)}
            className={inputClass}
            placeholder="Optional"
          />
          {fieldError("description")}
        </div>
        <p className="text-xs text-slate-400">
          Date-times are interpreted as UTC.
        </p>
      </form>
    </Modal>
  );
}
