import { useState, type FormEvent } from "react";
import { type Event, ApiError, api } from "../api";
import { fromInputValue, toInputValue } from "../dates";
import { Modal } from "./Modal";

export default function EventFormModal({
  event,
  defaultStart,
  defaultEnd,
  onSaved,
  onClose,
}: {
  event: Event | null;
  defaultStart?: string;
  defaultEnd?: string;
  onSaved: (event: Event) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [start, setStart] = useState(
    event ? toInputValue(event.start_time) : (defaultStart ?? ""),
  );
  const [end, setEnd] = useState(event ? toInputValue(event.end_time) : (defaultEnd ?? ""));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError("");
    const payload = {
      title,
      description: description.trim() ? description : null,
      location: location.trim() ? location : null,
      start_time: fromInputValue(start),
      end_time: fromInputValue(end),
    };
    try {
      const saved = event
        ? await api.updateEvent(event.id, payload)
        : await api.createEvent(payload);
      onSaved(saved);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(err.status === 401 ? "Your session expired; please sign in again." : err.message);
      } else {
        setFormError("Network error, please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const label = "mb-1 block text-sm font-medium text-slate-700";
  const input =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

  return (
    <Modal title={event ? "Edit event" : "New event"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={label}>Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={input}
          />
          {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title}</p>}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Starts *</label>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={input}
            />
            {errors.start_time && (
              <p className="mt-1 text-xs text-red-600">{errors.start_time}</p>
            )}
          </div>
          <div>
            <label className={label}>Ends *</label>
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={input}
            />
            {errors.end_time && (
              <p className="mt-1 text-xs text-red-600">{errors.end_time}</p>
            )}
          </div>
        </div>
        <div>
          <label className={label}>Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={input}
          />
          {errors.location && (
            <p className="mt-1 text-xs text-red-600">{errors.location}</p>
          )}
        </div>
        <div>
          <label className={label}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={`${input} resize-y`}
          />
          {errors.description && (
            <p className="mt-1 text-xs text-red-600">{errors.description}</p>
          )}
        </div>
        {formError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
        )}
        <p className="text-xs text-slate-400">
          Date-times are interpreted as UTC. Leaving location/description empty
          clears them.
        </p>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? "Saving…" : event ? "Save changes" : "Create event"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
