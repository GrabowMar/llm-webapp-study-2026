import { useState } from "react";
import { ApiError, createEvent, deleteEvent, updateEvent } from "../api";
import type { EventInput, EventItem } from "../types";
import { defaultInputFor, fmtDateTime, isoToInput, inputToIso } from "../date";

interface Props {
  event: EventItem | null;
  day: Date;
  token: string | null;
  onClose: () => void;
  onSaved: (event: EventItem) => void;
  onDeleted: (id: number) => void;
}

export function EventDetails({
  event,
  token,
  onClose,
  onEdit,
  onDelete,
}: {
  event: EventItem;
  token: string | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold text-slate-900">{event.title}</h3>
        <p className="mt-1 text-sm text-slate-500">
          {fmtDateTime(event.start_time)} – {fmtDateTime(event.end_time)}
        </p>
      </div>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="font-medium text-slate-500">Location</dt>
          <dd className="text-slate-800">{event.location || "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Description</dt>
          <dd className="whitespace-pre-wrap text-slate-800">{event.description || "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Created by</dt>
          <dd className="text-slate-800">
            {event.created_by} · {fmtDateTime(event.created_at)}
          </dd>
        </div>
      </dl>
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
        {token && (
          <>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Edit
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface FormProps {
  event: EventItem | null;
  day: Date;
  token: string;
  onClose: () => void;
  onSaved: (event: EventItem) => void;
  onDeleted: (id: number) => void;
}

export function EventForm({ event, day, token, onClose, onSaved, onDeleted }: FormProps) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [startTime, setStartTime] = useState(
    event ? isoToInput(event.start_time) : defaultInputFor(day, 9),
  );
  const [endTime, setEndTime] = useState(
    event ? isoToInput(event.end_time) : defaultInputFor(day, 10),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setMessage("");
    const input: EventInput = {
      title,
      description: description.trim() ? description : null,
      location: location.trim() ? location : null,
      start_time: inputToIso(startTime),
      end_time: inputToIso(endTime),
    };
    if (!input.start_time || !input.end_time) {
      setMessage("Please choose both a start and an end time.");
      return;
    }
    setBusy(true);
    try {
      const saved = event
        ? await updateEvent(token, event.id, input)
        : await createEvent(token, input);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.fieldErrors);
      } else {
        setMessage("Could not save the event.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!event) return;
    if (!window.confirm(`Delete “${event.title}”? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteEvent(token, event.id);
      onDeleted(event.id);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not delete the event.");
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
  const labelClass = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <form onSubmit={submit} className="space-y-4">
      <h3 className="text-xl font-semibold text-slate-900">
        {event ? "Edit event" : "New event"}
      </h3>
      {message && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          {message}
        </p>
      )}
      <div>
        <label className={labelClass} htmlFor="event-title">
          Title
        </label>
        <input
          id="event-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={fieldClass}
          required
        />
        {errors.title && <p className="mt-1 text-xs text-rose-600">{errors.title}</p>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="event-start">
            Start (UTC)
          </label>
          <input
            id="event-start"
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className={fieldClass}
            required
          />
          {errors.start_time && <p className="mt-1 text-xs text-rose-600">{errors.start_time}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor="event-end">
            End (UTC)
          </label>
          <input
            id="event-end"
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className={fieldClass}
            required
          />
          {errors.end_time && <p className="mt-1 text-xs text-rose-600">{errors.end_time}</p>}
        </div>
      </div>
      <div>
        <label className={labelClass} htmlFor="event-location">
          Location
        </label>
        <input
          id="event-location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className={fieldClass}
        />
        {errors.location && <p className="mt-1 text-xs text-rose-600">{errors.location}</p>}
      </div>
      <div>
        <label className={labelClass} htmlFor="event-description">
          Description
        </label>
        <textarea
          id="event-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className={fieldClass}
        />
        {errors.description && <p className="mt-1 text-xs text-rose-600">{errors.description}</p>}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        {event && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="mr-auto rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
          >
            Delete
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? "Saving…" : event ? "Save changes" : "Create event"}
        </button>
      </div>
    </form>
  );
}

export default function EventModal(props: Props) {
  const { event, day, token, onClose, onSaved, onDeleted } = props;
  const [editing, setEditing] = useState(event === null && token !== null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDelete() {
    if (!event) return;
    setConfirmDelete(true);
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {confirmDelete && event ? (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-slate-900">Delete event?</h3>
            <p className="text-sm text-slate-600">
              “{event.title}” will be permanently removed.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!token) return;
                  try {
                    await deleteEvent(token, event.id);
                    onDeleted(event.id);
                  } catch {
                    setConfirmDelete(false);
                  }
                }}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
              >
                Delete
              </button>
            </div>
          </div>
        ) : editing && token ? (
          <EventForm
            event={event}
            day={day}
            token={token}
            onClose={onClose}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        ) : event ? (
          <EventDetails
            event={event}
            token={token}
            onClose={onClose}
            onEdit={() => setEditing(true)}
            onDelete={handleDelete}
          />
        ) : (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-slate-900">Sign in to create events</h3>
            <p className="text-sm text-slate-600">
              You need an account to add events to the calendar.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
