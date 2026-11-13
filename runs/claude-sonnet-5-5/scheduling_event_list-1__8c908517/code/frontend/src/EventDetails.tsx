import { useState } from "react";
import * as api from "./api";
import { fmtDateTime } from "./dates";
import type { CalEvent } from "./types";
import { Button, Modal } from "./ui";

export default function EventDetails({
  event,
  signedIn,
  onClose,
  onEdit,
  onDeleted,
}: {
  event: CalEvent;
  signedIn: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api.deleteEvent(event.id);
      onDeleted();
    } catch (err) {
      if (err instanceof api.ApiError && err.status === 404) onDeleted();
      else setError(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  return (
    <Modal title={event.title} onClose={onClose}>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="font-medium text-slate-500">Starts</dt>
          <dd>{fmtDateTime(event.start_time)}</dd>
        </div>
        {event.end_time && (
          <div>
            <dt className="font-medium text-slate-500">Ends</dt>
            <dd>{fmtDateTime(event.end_time)}</dd>
          </div>
        )}
        {event.location && (
          <div>
            <dt className="font-medium text-slate-500">Location</dt>
            <dd className="break-words">{event.location}</dd>
          </div>
        )}
        {event.description && (
          <div>
            <dt className="font-medium text-slate-500">Description</dt>
            <dd className="break-words whitespace-pre-wrap">{event.description}</dd>
          </div>
        )}
        <div>
          <dt className="font-medium text-slate-500">Created by</dt>
          <dd>{event.created_by}</dd>
        </div>
      </dl>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {signedIn && !confirming && (
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onEdit}>Edit</Button>
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        </div>
      )}
      {signedIn && confirming && (
        <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm">
          <p className="mb-3">Delete this event? This cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="danger" disabled={busy} onClick={remove}>
              Confirm delete
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
