import { useState } from "react";
import { usePoll } from "../hooks/usePoll";
import { api, type Auth, type Reading, type Sensor } from "../lib/api";
import { Link, navigate } from "../lib/router";
import { formatDate, timeAgo } from "../lib/time";
import Chart from "./Chart";
import ReadingForm from "./ReadingForm";

const READINGS_LIMIT = 100;

export default function SensorPage({
  id,
  auth,
}: {
  id: number;
  auth: Auth | null;
}) {
  const { data, error, loading, refresh } = usePoll(
    async () => {
      const [sensor, readings] = await Promise.all([
        api.getSensor(id),
        api.getReadings(id, READINGS_LIMIT),
      ]);
      return { sensor, readings };
    },
    [id, auth],
    10000,
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const sensor: Sensor | undefined = data?.sensor;
  const readings: Reading[] = data?.readings.items ?? [];
  const total: number = data?.readings.total ?? 0;
  const isOwner =
    auth !== null &&
    sensor !== undefined &&
    sensor.owner.toLowerCase() === auth.username.toLowerCase();

  async function handleDelete() {
    if (!sensor) return;
    const confirmed = window.confirm(
      `Delete sensor "${sensor.name}" and all of its readings? This cannot be undone.`,
    );
    if (!confirmed) return;
    setActionError(null);
    try {
      await api.deleteSensor(sensor.id);
      navigate("/");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="inline-block text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        ← Back to dashboard
      </Link>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          {error}
        </div>
      )}
      {!sensor && !error && loading && (
        <p className="text-sm text-slate-500">Loading sensor…</p>
      )}

      {sensor && (
        <>
          <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  {sensor.name}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Owned by {sensor.owner}
                  {sensor.location ? ` · ${sensor.location}` : ""}
                  {sensor.unit ? ` · unit ${sensor.unit}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold tracking-tight text-slate-900">
                  {sensor.last_value ?? "—"}
                  {sensor.last_value !== null && sensor.unit && (
                    <span className="ml-1 text-base font-medium text-slate-500">
                      {sensor.unit}
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {sensor.last_updated
                    ? `Updated ${timeAgo(sensor.last_updated)}`
                    : "No readings yet"}
                </p>
              </div>
            </div>
            {isOwner && (
              <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={handleDelete}
                  className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
                >
                  Delete sensor
                </button>
              </div>
            )}
          </header>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">
                  Recent readings
                </h2>
                <span className="text-xs text-slate-500">
                  Auto-refreshes every 10 seconds
                </span>
              </div>
              <Chart readings={readings} unit={sensor.unit} />
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">
                Sensor details
              </h2>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-slate-500">Unit</dt>
                  <dd className="font-medium text-slate-900">
                    {sensor.unit || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Location</dt>
                  <dd className="font-medium text-slate-900">
                    {sensor.location || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Owner</dt>
                  <dd className="font-medium text-slate-900">
                    {sensor.owner}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Total readings</dt>
                  <dd className="font-medium text-slate-900">{total}</dd>
                </div>
              </dl>

              {isOwner && (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <h3 className="mb-3 text-sm font-semibold text-slate-900">
                    Post a reading
                  </h3>
                  <ReadingForm
                    sensors={[sensor]}
                    fixedSensorId={sensor.id}
                    onDone={refresh}
                  />
                </div>
              )}
            </section>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">
                Readings
              </h2>
              <span className="text-xs text-slate-500">
                {readings.length === total
                  ? `${total} total`
                  : `Showing ${readings.length} of ${total}`}
              </span>
            </div>

            {actionError && (
              <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {actionError}
              </p>
            )}

            {readings.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                No readings recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-4 font-medium">Recorded at</th>
                      <th className="py-2 pr-4 font-medium">Value</th>
                      <th className="py-2 font-medium">Relative</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readings.map((reading) => (
                      <tr
                        key={reading.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="py-2 pr-4 text-slate-700">
                          {formatDate(reading.recorded_at)}
                        </td>
                        <td className="py-2 pr-4 font-medium text-slate-900">
                          {reading.value}
                          {sensor.unit ? ` ${sensor.unit}` : ""}
                        </td>
                        <td className="py-2 text-slate-500">
                          {timeAgo(reading.recorded_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
