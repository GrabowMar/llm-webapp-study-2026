import { useState } from "react";
import { formatValue, timeAgo } from "../format";
import type { Sensor } from "../types";

export default function SensorCard({
  sensor,
  owned,
  onOpen,
  onDelete,
}: {
  sensor: Sensor;
  owned: boolean;
  onOpen: () => void;
  onDelete: (id: number) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await onDelete(sensor.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete sensor");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={onOpen}
          className="text-left text-lg font-semibold text-slate-800 hover:text-indigo-600"
        >
          {sensor.name}
        </button>
        {owned ? (
          confirming ? (
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={handleDelete}
                disabled={busy}
                className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Delete
            </button>
          )
        ) : null}
      </div>

      <p className="mt-1 text-sm text-slate-500">
        {sensor.owner}
        {sensor.location ? ` · ${sensor.location}` : ""}
      </p>

      <p className="mt-4 text-3xl font-bold text-slate-900">
        {sensor.last_value === null ? (
          <span className="text-xl font-medium text-slate-400">No readings yet</span>
        ) : (
          formatValue(sensor.last_value, sensor.unit)
        )}
      </p>
      <p className="mt-1 text-sm text-slate-500">
        updated {timeAgo(sensor.last_updated)}
      </p>

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
