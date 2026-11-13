import { useState, type FormEvent } from "react";
import * as api from "./api";
import { fromLocalInput, toLocalInput } from "./dates";
import type { CalEvent } from "./types";
import { Button, Field, Modal, inputClass } from "./ui";

export default function EventForm({
  event,
  defaultStart,
  onClose,
  onSaved,
}: {
  event: CalEvent | null;
  defaultStart: Date;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [start, setStart] = useState(toLocalInput(event?.start_time ?? defaultStart.toISOString()));
  const [end, setEnd] = useState(toLocalInput(event?.end_time));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setMessage("");
    setBusy(true);
    const payload = {
      title,
      description: description || null,
      location: location || null,
      start_time: start ? (fromLocalInput(start) ?? start) : "",
      end_time: end ? (fromLocalInput(end) ?? end) : null,
    };
    try {
      if (event) await api.updateEvent(event.id, payload);
      else await api.createEvent(payload);
      onSaved();
    } catch (err) {
      if (err instanceof api.ApiError) {
        setErrors(err.fieldErrors);
        if (Object.keys(err.fieldErrors).length === 0) setMessage(err.message);
      } else setMessage("Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={event ? "Edit event" : "New event"} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field label="Title" error={errors.title}>
          <input
            className={inputClass}
            name="title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Start" error={errors.start_time}>
          <input
            className={inputClass}
            name="start_time"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="End (optional)" error={errors.end_time}>
          <input
            className={inputClass}
            name="end_time"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
        <Field label="Location (optional)" error={errors.location}>
          <input
            className={inputClass}
            name="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </Field>
        <Field label="Description (optional)" error={errors.description}>
          <textarea
            className={inputClass}
            name="description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        {message && (
          <p role="alert" className="mb-3 text-sm text-red-600">
            {message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
