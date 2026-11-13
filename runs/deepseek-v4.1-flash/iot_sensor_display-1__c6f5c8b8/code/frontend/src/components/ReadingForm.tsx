import { useEffect, useState, type FormEvent } from "react";
import { createReading, type Sensor } from "../api";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

export default function ReadingForm({
  sensors,
  presetSensorId,
  onPosted,
}: {
  sensors: Sensor[];
  presetSensorId?: number;
  onPosted: () => void;
}) {
  const [sensorId, setSensorId] = useState<string>(
    presetSensorId ? String(presetSensorId) : "",
  );
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (presetSensorId) {
      setSensorId(String(presetSensorId));
    } else if (sensors.length > 0 && !sensors.some((s) => String(s.id) === sensorId)) {
      setSensorId(String(sensors[0].id));
    }
  }, [sensors, presetSensorId, sensorId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (!sensorId) {
      setError("Register a sensor first");
      return;
    }
    const numeric = Number(value);
    if (value.trim() === "" || !Number.isFinite(numeric)) {
      setError("Enter a numeric value");
      return;
    }
    setBusy(true);
    try {
      await createReading(sensorId, numeric);
      setValue("");
      setSuccess("Reading recorded");
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post reading");
    } finally {
      setBusy(false);
    }
  }

  const disabled = sensors.length === 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Sensor
        </label>
        <select
          value={sensorId}
          onChange={(event) => setSensorId(event.target.value)}
          disabled={disabled}
          className={inputClass}
        >
          {disabled ? (
            <option value="">No sensors yet</option>
          ) : (
            sensors.map((sensor) => (
              <option key={sensor.id} value={sensor.id}>
                {sensor.name}
                {sensor.unit ? ` (${sensor.unit})` : ""}
              </option>
            ))
          )}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Value
        </label>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          inputMode="decimal"
          placeholder="21.5"
          className={inputClass}
        />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {success && !error && (
        <p className="text-sm font-medium text-emerald-600">{success}</p>
      )}
      <button
        type="submit"
        disabled={busy || disabled}
        className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-40"
      >
        {busy ? "Posting…" : "Post reading"}
      </button>
    </form>
  );
}
