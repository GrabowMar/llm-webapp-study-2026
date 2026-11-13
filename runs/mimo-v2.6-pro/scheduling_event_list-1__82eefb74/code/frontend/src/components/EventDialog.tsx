import { useState } from "react";
import * as api from "../api";
import { formatEventTime, isoToInputValue } from "../dates";
import type { CalendarEvent, DialogState, EventPayload } from "../types";

interface Props {
  state: DialogState;
  signedIn: boolean;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (event: CalendarEvent) => void;
  onUnauthorized: () => void;
}

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

const labelCls = "mb-1 block text-sm font-medium text-slate-700";

export default function EventDialog(props: Props) {
  const { state, onClose } = props;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {state.kind === "view" ? (
          <DetailsView {...props} event={state.event} />
        ) : (
          <EventForm
            {...props}
            event={state.kind === "edit" ? state.event : null}
            dateKey={state.kind === "create" ? state.dateKey : null}
          />
        )}
      </div>
    </div>
  );
}

function DetailsView({ event, signedIn, onClose, onEdit, onChanged, onUnauthorized }: Props & { event: CalendarEvent }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteEvent(event.id);
      onChanged();
    } catch (err) {
      if (err instanceof api.ApiError && err.status === 401) {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 className="text-xl font-semibold text-slate-900">{event.title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <dl className="space-y-3 text-sm">
        <div className="flex gap-3">
          <dt className="w-24 shrink-0 font-medium text-slate-500">When</dt>
          <dd className="text-slate-900">
            {formatEventTime(event.start_time)}
            {event.end_time && (
              <>
                <span className="text-slate-400"> → </span>
                {formatEventTime(event.end_time)}
              </>
            )}
          </dd>
        </div>
        {event.location && (
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 font-medium text-slate-500">Where</dt>
            <dd className="text-slate-900">{event.location}</dd>
          </div>
        )}
        {event.description && (
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 font-medium text-slate-500">Details</dt>
            <dd className="whitespace-pre-wrap text-slate-900">{event.description}</dd>
          </div>
        )}
        <div className="flex gap-3">
          <dt className="w-24 shrink-0 font-medium text-slate-500">Created</dt>
          <dd className="text-slate-500">
            by {event.created_by} · {formatEventTime(event.created_at)}
          </dd>
        </div>
      </dl>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="mt-6 flex items-center justify-end gap-2">
        {confirming ? (
          <>
            <span className="mr-auto text-sm text-slate-600">Delete this event?</span>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
          </>
        ) : (
          <>
            {signedIn && (
              <>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="mr-auto rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(event)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Edit
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function EventForm({
  event,
  dateKey,
  signedIn,
  onClose,
  onChanged,
  onUnauthorized,
}: Props & { event: CalendarEvent | null; dateKey: string | null }) {
  const defaults = () => ({
    title: event ? event.title : "",
    description: event?.description ?? "",
    location: event?.location ?? "",
    start: event ? isoToInputValue(event.start_time) : `${dateKey ?? ""}T09:00`,
    end: event?.end_time ? isoToInputValue(event.end_time) : "",
  });

  const [values, setValues] = useState(defaults);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const payload: EventPayload = {
      title: values.title,
      description: values.description.trim() ? values.description.trim() : null,
      location: values.location.trim() ? values.location.trim() : null,
      start_time: values.start,
      end_time: values.end ? values.end : null,
    };
    try {
      if (event) {
        await api.updateEvent(event.id, payload);
      } else {
        await api.createEvent(payload);
      }
      onChanged();
    } catch (err) {
      if (err instanceof api.ApiError && err.status === 401) {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          {event ? "Edit event" : "New event"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {!signedIn && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You need to sign in to save events.
        </p>
      )}

      <div className="space-y-4">
        <label className="block">
          <span className={labelCls}>Title</span>
          <input
            className={inputCls}
            value={values.title}
            onChange={(e) => setValues({ ...values, title: e.target.value })}
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Starts (UTC)</span>
            <input
              type="datetime-local"
              className={inputCls}
              value={values.start}
              onChange={(e) => setValues({ ...values, start: e.target.value })}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Ends (UTC, optional)</span>
            <input
              type="datetime-local"
              className={inputCls}
              value={values.end}
              onChange={(e) => setValues({ ...values, end: e.target.value })}
            />
          </label>
        </div>

        <label className="block">
          <span className={labelCls}>Location (optional)</span>
          <input
            className={inputCls}
            value={values.location}
            onChange={(e) => setValues({ ...values, location: e.target.value })}
          />
        </label>

        <label className="block">
          <span className={labelCls}>Description (optional)</span>
          <textarea
            rows={3}
            className={inputCls}
            value={values.description}
            onChange={(e) => setValues({ ...values, description: e.target.value })}
          />
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !signedIn}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? "Saving…" : event ? "Save changes" : "Create event"}
        </button>
      </div>
    </form>
  );
}
