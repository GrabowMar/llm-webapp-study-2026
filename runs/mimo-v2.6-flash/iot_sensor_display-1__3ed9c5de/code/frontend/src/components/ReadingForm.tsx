import { useState, type FormEvent } from "react";
import { api, type Sensor } from "../lib/api";

function toPayload(raw: string): number | string {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : trimmed;
}

export default function ReadingForm({
  sensors,
  fixedSensorId,
  onDone,
}: {
  sensors: Sensor[];
  fixedSensorId?: number;
  onDone: () => void;
}) {
  const [sensorId, setSensorId] = useState<string>(
    fixedSensorId !== undefined ? String(fixedSensorId) : "",
  );
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choices =
    fixedSensorId !== undefined
      ? sensors.filter((sensor) => sensor.id === fixedSensorId)
      : sensors;
  const selected =
    choices.find((sensor) => String(sensor.id) === sensorId) ?? choices[0];
  const canSubmit =
    !busy && selected !== undefined && value.trim() !== "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.createReading(selected.id, toPayload(value));
      setValue("");
      setMessage(`Reading posted to "${selected.name}".`);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {choices.length === 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Register a sensor first to post readings.
        </p>
      ) : (
        <>
          {fixedSensorId === undefined && (
            <div>
              <label
                htmlFor="reading-sensor"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Sensor
              </label>
              <select
                id="reading-sensor"
                value={selected ? String(selected.id) : ""}
                onChange={(event) => setSensorId(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              >
                {choices.map((sensor) => (
                  <option key={sensor.id} value={sensor.id}>
                    {sensor.name}
                    {sensor.unit ? ` (${sensor.unit})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label
              htmlFor="reading-value"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Value{selected?.unit ? ` (${selected.unit})` : ""}
            </label>
            <input
              id="reading-value"
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="e.g. 21.4"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
        </>
      )}

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Posting..." : "Post reading"}
      </button>
    </form>
  );
}
