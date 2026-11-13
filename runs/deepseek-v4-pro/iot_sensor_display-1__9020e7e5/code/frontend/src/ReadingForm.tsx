import { useState, type FormEvent } from "react";
import { api, type Reading, type Sensor } from "./api";
import { useAuth } from "./auth";

export function ReadingForm({
  sensors,
  onPosted,
}: {
  sensors: Sensor[];
  onPosted: () => void;
}) {
  const { token, username } = useAuth();
  const [sensorId, setSensorId] = useState<string>("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mine = sensors.filter((s) => s.owner === username);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api<Reading>(`/sensors/${sensorId}/readings`, {
        method: "POST",
        token,
        body: { value: Number(value) },
      });
      setValue("");
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-slate-900">Post a reading</h3>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <select
          value={sensorId}
          onChange={(e) => setSensorId(e.target.value)}
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        >
          <option value="" disabled>
            Select a sensor…
          </option>
          {mine.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Value"
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !sensorId}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Post reading
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
