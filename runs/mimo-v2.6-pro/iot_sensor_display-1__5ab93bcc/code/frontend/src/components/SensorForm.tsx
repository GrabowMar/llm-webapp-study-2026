import { useState } from "react";
import type { FormEvent } from "react";
import { createSensor } from "../api";

export default function SensorForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await createSensor({ name, unit, location });
      setName("");
      setUnit("");
      setLocation("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register sensor");
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
      <h2 className="mb-4 text-lg font-semibold text-slate-800">Register a sensor</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-medium text-slate-600">
          Name
          <input
            className={`${input} mt-1`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-600">
          Unit
          <input
            className={`${input} mt-1`}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="e.g. °C"
          />
        </label>
        <label className="block text-sm font-medium text-slate-600">
          Location
          <input
            className={`${input} mt-1`}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. greenhouse"
          />
        </label>
      </div>
      <button
        type="submit"
        className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
        disabled={busy}
      >
        Add sensor
      </button>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
