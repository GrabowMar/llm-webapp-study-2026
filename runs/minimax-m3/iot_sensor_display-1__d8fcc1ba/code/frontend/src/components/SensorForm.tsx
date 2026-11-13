import { useState, type FormEvent } from "react";
import { createSensor } from "../api";
import { errorTextClass, inputClass, labelClass, primaryButtonClass, successTextClass } from "../ui";

export default function SensorForm({ onCreated }: { onCreated?: () => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const sensor = await createSensor({ name: name.trim(), unit: unit.trim(), location: location.trim() });
      setMessage(`Registered "${sensor.name}".`);
      setName("");
      setUnit("");
      setLocation("");
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register the sensor");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-100">Register a sensor</h3>
        <p className="mt-1 text-sm text-slate-400">The sensor is owned by your account.</p>
      </div>
      <div>
        <label className={labelClass} htmlFor="sensor-name">
          Name
        </label>
        <input
          id="sensor-name"
          className={inputClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Living room temperature"
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="sensor-unit">
            Unit
          </label>
          <input
            id="sensor-unit"
            className={inputClass}
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            placeholder="°C"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="sensor-location">
            Location
          </label>
          <input
            id="sensor-location"
            className={inputClass}
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Living room"
          />
        </div>
      </div>
      <button type="submit" className={primaryButtonClass} disabled={busy}>
        {busy ? "Saving…" : "Register sensor"}
      </button>
      {error ? <p className={errorTextClass}>{error}</p> : null}
      {message ? <p className={successTextClass}>{message}</p> : null}
    </form>
  );
}
