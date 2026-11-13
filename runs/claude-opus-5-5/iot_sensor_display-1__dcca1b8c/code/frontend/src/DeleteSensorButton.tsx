import { useEffect, useRef, useState } from "react";
import { api, type Sensor } from "./api";
import { Button, ErrorMessage, errorText } from "./ui";

export function DeleteSensorButton({
  sensor,
  onDeleted,
  compact = false,
}: {
  sensor: Sensor;
  onDeleted: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteSensor(sensor.id);
      setOpen(false);
      onDeleted();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {compact ? (
        <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-red-600 hover:text-red-500">
          Delete
        </button>
      ) : (
        <Button type="button" variant="danger" onClick={() => setOpen(true)}>
          Delete sensor
        </Button>
      )}
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="m-auto w-full max-w-md rounded-xl p-0 shadow-xl backdrop:bg-slate-900/50"
      >
        <div className="p-6">
          <h2 className="text-lg font-semibold text-slate-900">Delete sensor?</h2>
          <p className="mt-2 text-sm text-slate-600">
            This permanently deletes <span className="font-semibold">{sensor.name}</span> and all of its readings. This
            cannot be undone.
          </p>
          <div className="mt-3">
            <ErrorMessage message={error} />
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={confirm} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
