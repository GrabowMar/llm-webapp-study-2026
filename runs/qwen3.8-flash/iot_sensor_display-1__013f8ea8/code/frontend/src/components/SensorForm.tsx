import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api";

export default function SensorForm({ onSaved }: { onSaved: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.createSensor(name, unit, location);
      setName("");
      setUnit("");
      setLocation("");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not register sensor");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-600">Sensor name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Kitchen temperature"
          className="w-48 rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:outline-none"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-600">Unit</span>
        <input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="°C"
          className="w-24 rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:outline-none"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-600">Location</span>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Kitchen"
          className="w-44 rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {busy ? "Registering…" : "Register sensor"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
