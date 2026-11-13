import { useState, type FormEvent } from "react";
import { createReading, type Sensor } from "../api";
import { errorTextClass, inputClass, labelClass, primaryButtonClass, successTextClass } from "../ui";

export default function ReadingForm({
  sensors,
  fixedSensorId,
  onPosted,
}: {
  sensors: Sensor[];
  fixedSensorId?: number;
  onPosted?: () => void;
}) {
  const [sensorId, setSensorId] = useState<string>(
    fixedSensorId !== undefined ? String(fixedSensorId) : sensors[0] ? String(sensors[0].id) : "",
  );
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const targetId = fixedSensorId !== undefined ? fixedSensorId : Number(sensorId);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const parsed = Number(value);
    if (!value.trim() || Number.isNaN(parsed)) {
      setError("Enter a numeric value");
      return;
    }
    if (!targetId) {
      setError("Select a sensor");
      return;
    }
    setBusy(true);
    try {
      const reading = await createReading(targetId, parsed);
      setMessage(`Recorded ${reading.value}.`);
      setValue("");
      onPosted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the reading");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-100">Post a reading</h3>
        <p className="mt-1 text-sm text-slate-400">The newest reading becomes the latest value.</p>
      </div>

      {fixedSensorId === undefined ? (
        <div>
          <label className={labelClass} htmlFor="reading-sensor">
            Sensor
          </label>
          <select
            id="reading-sensor"
            className={inputClass}
            value={sensorId}
            onChange={(event) => setSensorId(event.target.value)}
            required
          >
            {sensors.length === 0 ? <option value="">No sensors yet</option> : null}
            {sensors.map((sensor) => (
              <option key={sensor.id} value={sensor.id}>
                {sensor.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label className={labelClass} htmlFor="reading-value">
          Value
        </label>
        <input
          id="reading-value"
          className={inputClass}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          inputMode="decimal"
          placeholder="21.5"
          required
        />
      </div>

      <button type="submit" className={primaryButtonClass} disabled={busy || !targetId}>
        {busy ? "Saving…" : "Post reading"}
      </button>
      {error ? <p className={errorTextClass}>{error}</p> : null}
      {message ? <p className={successTextClass}>{message}</p> : null}
    </form>
  );
}
