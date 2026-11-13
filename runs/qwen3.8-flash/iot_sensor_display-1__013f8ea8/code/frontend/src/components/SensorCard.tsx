import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Sensor } from "../api";
import { formatValue, timeAgo } from "../format";

interface Props {
  sensor: Sensor;
  isMine: boolean;
  onChanged: () => Promise<void>;
}

export default function SensorCard({ sensor, isMine, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (
      !window.confirm(
        `Delete sensor “${sensor.name}” (#${sensor.id}) and all of its readings?`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteSensor(sensor.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/sensors/${sensor.id}`}
          className="truncate font-semibold text-slate-800 hover:text-emerald-600"
        >
          {sensor.name}
        </Link>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
          #{sensor.id}
        </span>
      </div>
      <p className="mt-1 text-3xl font-bold text-emerald-600">
        {formatValue(sensor.last_value, sensor.unit)}
      </p>
      <dl className="mt-3 space-y-1 text-xs text-slate-500">
        <div className="flex justify-between">
          <dt>Owner</dt>
          <dd className="text-slate-700">{sensor.owner}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Location</dt>
          <dd className="text-slate-700">{sensor.location || "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Updated</dt>
          <dd className="text-slate-700">{timeAgo(sensor.last_updated)}</dd>
        </div>
      </dl>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {isMine && (
        <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
          <ReadingForm sensor={sensor} onSaved={onChanged} />
          <button
            onClick={remove}
            disabled={busy}
            title="Delete sensor"
            className="shrink-0 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {busy ? "…" : "Delete"}
          </button>
        </div>
      )}
    </div>
  );
}

function ReadingForm({ sensor, onSaved }: { sensor: Sensor; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const number = Number(value);
    if (value.trim() === "" || Number.isNaN(number)) return;
    setBusy(true);
    try {
      await api.createReading(sensor.id, number);
      setValue("");
      await onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 gap-2">
      <input
        type="number"
        step="any"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={sensor.unit ? `value (${sensor.unit})` : "value"}
        className="w-full min-w-0 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy}
        className="shrink-0 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        Post
      </button>
    </form>
  );
}
