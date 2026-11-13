import { useState, type FormEvent } from "react";
import { createSensor, type Sensor } from "../api";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

export default function SensorForm({
  onCreated,
}: {
  onCreated: (sensor: Sensor) => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const sensor = await createSensor({ name, unit, location });
      setName("");
      setUnit("");
      setLocation("");
      onCreated(sensor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create sensor");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Sensor name
        </label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          placeholder="Living room temperature"
          className={inputClass}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Unit
          </label>
          <input
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            placeholder="°C"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Location
          </label>
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Living room"
            className={inputClass}
          />
        </div>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400 disabled:opacity-50"
      >
        {busy ? "Registering…" : "Register sensor"}
      </button>
    </form>
  );
}
