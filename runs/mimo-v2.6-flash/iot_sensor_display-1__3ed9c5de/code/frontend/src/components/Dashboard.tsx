import { useState, type FormEvent } from "react";
import { usePoll } from "../hooks/usePoll";
import { api, type Auth, type Sensor } from "../lib/api";
import { Link } from "../lib/router";
import { timeAgo } from "../lib/time";
import AuthForms from "./AuthForms";
import ReadingForm from "./ReadingForm";

function RegisterSensorForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createSensor({
        name: name.trim(),
        unit: unit.trim(),
        location: location.trim(),
      });
      setName("");
      setUnit("");
      setLocation("");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label
          htmlFor="sensor-name"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Name
        </label>
        <input
          id="sensor-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Living room thermometer"
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="sensor-unit"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Unit
          </label>
          <input
            id="sensor-unit"
            type="text"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            placeholder="°C"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
          />
        </div>
        <div>
          <label
            htmlFor="sensor-location"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Location
          </label>
          <input
            id="sensor-location"
            type="text"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Kitchen"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
          />
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}</p>
      )}

      <button
        type="submit"
        disabled={busy || name.trim() === ""}
        className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Registering..." : "Register sensor"}
      </button>
    </form>
  );
}

function SensorCard({
  sensor,
  isOwner,
  onDelete,
}: {
  sensor: Sensor;
  isOwner: boolean;
  onDelete: (sensor: Sensor) => void;
}) {
  return (
    <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <Link
            to={`/sensors/${sensor.id}`}
            className="text-base font-semibold text-slate-900 hover:text-sky-600"
          >
            {sensor.name}
          </Link>
          <p className="text-xs text-slate-500">
            Owned by {sensor.owner}
            {sensor.location ? ` · ${sensor.location}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {sensor.unit || "unit n/a"}
        </span>
      </div>

      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight text-slate-900">
          {sensor.last_value ?? "—"}
        </span>
        {sensor.last_value !== null && sensor.unit && (
          <span className="text-sm font-medium text-slate-500">
            {sensor.unit}
          </span>
        )}
      </div>

      <p className="text-xs text-slate-500">
        {sensor.last_updated
          ? `Updated ${timeAgo(sensor.last_updated)}`
          : "No readings yet"}
      </p>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <Link
          to={`/sensors/${sensor.id}`}
          className="text-sm font-medium text-sky-600 hover:text-sky-700"
        >
          View details →
        </Link>
        {isOwner && (
          <button
            type="button"
            onClick={() => onDelete(sensor)}
            className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
          >
            Delete
          </button>
        )}
      </div>
    </article>
  );
}

export default function Dashboard({
  auth,
  onAuth,
}: {
  auth: Auth | null;
  onAuth: (auth: Auth) => void;
}) {
  const { data, error, refresh } = usePoll(
    () => api.getSensors(),
    [auth],
    10000,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const sensors = data?.items ?? [];
  const mine = auth
    ? sensors.filter(
        (sensor) => sensor.owner.toLowerCase() === auth.username.toLowerCase(),
      )
    : [];

  async function handleDelete(sensor: Sensor) {
    const confirmed = window.confirm(
      `Delete sensor "${sensor.name}" and all of its readings? This cannot be undone.`,
    );
    if (!confirmed) return;
    setActionError(null);
    try {
      await api.deleteSensor(sensor.id);
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-8">
      {auth ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Register a sensor
            </h2>
            <RegisterSensorForm onDone={refresh} />
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Post a reading
            </h2>
            <ReadingForm sensors={mine} onDone={refresh} />
          </section>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <AuthForms onAuth={onAuth} />
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="mb-2 text-lg font-semibold text-slate-900">
              Watch live sensor data
            </h2>
            <p className="text-sm text-slate-600">
              Anyone can browse the sensors below and their recent history.
              Create an account to register your own sensors and post readings
              to them.
            </p>
          </section>
        </div>
      )}

      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Sensors</h2>
          <span className="text-xs text-slate-500">
            Auto-refreshes every 10 seconds
          </span>
        </div>

        {actionError && (
          <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {actionError}
          </p>
        )}
        {error && (
          <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        {!data && !error ? (
          <p className="text-sm text-slate-500">Loading sensors…</p>
        ) : sensors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
            No sensors registered yet.
            {auth && " Use the form above to register the first one."}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sensors.map((sensor) => (
              <SensorCard
                key={sensor.id}
                sensor={sensor}
                isOwner={
                  auth !== null &&
                  sensor.owner.toLowerCase() === auth.username.toLowerCase()
                }
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
