import { useState } from "react";
import type { FormEvent } from "react";
import { createReading } from "../api";
import type { Sensor } from "../types";

export default function ReadingForm({
  sensors,
  onRecorded,
}: {
  sensors: Sensor[];
  onRecorded: () => void;
}) {
  const [sensorId, setSensorId] = useState<number | "">("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedId: number | "" =
    sensorId !== "" && sensors.some((s) => s.id === sensorId)
      ? sensorId
      : sensors.length > 0
        ? sensors[0].id
        : "";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (selectedId === "") return;
    setError(null);
    setBusy(true);
    try {
      await createReading(selectedId, Number(value));
      setValue("");
      onRecorded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record reading");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 className="mb-4 text-lg font-semibold text-slate-800">Record a reading</h2>
      {sensors.length === 0 ? (
        <p className="text-sm text-slate-500">
          Register a sensor first — readings go to your own sensors.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-600">
            Sensor
            <select
              className={`${input} mt-1`}
              value={selectedId}
              onChange={(e) => setSensorId(Number(e.target.value))}
            >
              {sensors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.unit ? ` (${s.unit})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-600">
            Value
            <input
              type="number"
              step="any"
              className={`${input} mt-1`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </label>
        </div>
      )}
      {sensors.length > 0 ? (
        <button
          type="submit"
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
          disabled={busy}
        >
          Record reading
        </button>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
