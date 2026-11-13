import { useState } from "react";

import { ApiError, api } from "../api";
import { inputToIso, isoToInput } from "../lib/dates";
import type { CalendarEvent } from "../types";
import { Modal } from "./Modal";

export interface EventFormValues {
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
}

interface EventFormModalProps {
  mode: "create" | "edit";
  event?: CalendarEvent;
  initial?: Partial<EventFormValues>;
  onClose: () => void;
  onSaved: (event: CalendarEvent) => void;
}

const fieldClass = (invalid: boolean) =>
  `mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 ${
    invalid ? "border-red-400 bg-red-50/40" : "border-slate-300"
  }`;

export function EventFormModal({ mode, event, initial, onClose, onSaved }: EventFormModalProps) {
  const [title, setTitle] = useState(
    initial?.title ?? (event ? event.title : ""),
  );
  const [description, setDescription] = useState(
    initial?.description ?? (event?.description ?? ""),
  );
  const [location, setLocation] = useState(
    initial?.location ?? (event?.location ?? ""),
  );
  const [start, setStart] = useState(
    initial?.start ?? (event ? isoToInput(event.start_time) : ""),
  );
  const [end, setEnd] = useState(
    initial?.end ?? (event ? isoToInput(event.end_time) : ""),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(submitEvent: React.FormEvent) {
    submitEvent.preventDefault();
    setSaving(true);
    setFieldErrors({});
    setFormError(null);
    const draft = {
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      start_time: inputToIso(start),
      end_time: inputToIso(end),
    };
    try {
      const saved =
        mode === "create"
          ? await api.createEvent(draft)
          : await api.updateEvent(event!.id, draft);
      onSaved(saved);
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        setFieldErrors(error.errors);
      } else {
        setFormError("The event could not be saved. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={mode === "create" ? "New event" : "Edit event"}
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
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : mode === "create" ? "Create event" : "Save changes"}
          </button>
        </>
      }
    >
      <form id="event-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        {formError ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
        ) : null}

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Title</span>
          <input
            name="title"
            value={title}
            onChange={(changeEvent) => setTitle(changeEvent.target.value)}
            placeholder="Team sync"
            className={fieldClass(Boolean(fieldErrors.title))}
          />
          {fieldErrors.title ? (
            <span className="mt-1 block text-xs text-red-600">{fieldErrors.title}</span>
          ) : null}
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Starts</span>
            <input
              name="start_time"
              type="datetime-local"
              step={60}
              value={start}
              onChange={(changeEvent) => setStart(changeEvent.target.value)}
              className={fieldClass(Boolean(fieldErrors.start_time))}
            />
            {fieldErrors.start_time ? (
              <span className="mt-1 block text-xs text-red-600">{fieldErrors.start_time}</span>
            ) : null}
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Ends</span>
            <input
              name="end_time"
              type="datetime-local"
              step={60}
              value={end}
              onChange={(changeEvent) => setEnd(changeEvent.target.value)}
              className={fieldClass(Boolean(fieldErrors.end_time))}
            />
            {fieldErrors.end_time ? (
              <span className="mt-1 block text-xs text-red-600">{fieldErrors.end_time}</span>
            ) : null}
          </label>
        </div>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Location</span>
          <input
            name="location"
            value={location}
            onChange={(changeEvent) => setLocation(changeEvent.target.value)}
            placeholder="Room 3 or a link"
            className={fieldClass(Boolean(fieldErrors.location))}
          />
          {fieldErrors.location ? (
            <span className="mt-1 block text-xs text-red-600">{fieldErrors.location}</span>
          ) : null}
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Description</span>
          <textarea
            name="description"
            rows={3}
            value={description}
            onChange={(changeEvent) => setDescription(changeEvent.target.value)}
            placeholder="Agenda, notes, links..."
            className={fieldClass(Boolean(fieldErrors.description))}
          />
          {fieldErrors.description ? (
            <span className="mt-1 block text-xs text-red-600">{fieldErrors.description}</span>
          ) : null}
        </label>

        <p className="text-xs text-slate-500">
          Times are shown and stored in UTC, matching the calendar API.
        </p>
      </form>
    </Modal>
  );
}
