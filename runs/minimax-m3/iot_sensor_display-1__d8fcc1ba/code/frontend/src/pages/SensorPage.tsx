import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteSensor, getSensor, listReadings, type Reading, type Sensor } from "../api";
import { useAuth } from "../auth";
import LineChart from "../components/LineChart";
import ReadingForm from "../components/ReadingForm";
import TimeAgo from "../components/TimeAgo";
import { formatTimestamp, formatValue } from "../format";
import { cardClass, dangerButtonClass, secondaryButtonClass } from "../ui";

const REFRESH_MS = 10_000;

export default function SensorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { username } = useAuth();
  const sensorId = Number(id);

  const [sensor, setSensor] = useState<Sensor | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(sensorId)) return;
    try {
      const [sensorResult, readingsResult] = await Promise.all([
        getSensor(sensorId),
        listReadings(sensorId, 200),
      ]);
      setSensor(sensorResult);
      setReadings(readingsResult.items);
      setTotal(readingsResult.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the sensor");
    } finally {
      setLoading(false);
    }
  }, [sensorId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteSensor(sensorId);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the sensor");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  const isOwner = Boolean(sensor && username && sensor.owner === username);

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
          Loading sensor…
        </div>
      </main>
    );
  }

  if (!sensor) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-300">
          {error ?? "This sensor could not be found."}
        </div>
        <Link to="/" className={`${secondaryButtonClass} mt-4`}>
          Back to dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-slate-400 transition hover:text-slate-200">
        <span aria-hidden="true">&larr;</span> All sensors
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">{sensor.name}</h1>
          <p className="mt-1 text-sm text-slate-400">
            Owned by <span className="font-medium text-slate-300">{sensor.owner}</span>
            {sensor.location ? (
              <>
                {" · "}
                <span className="font-medium text-slate-300">{sensor.location}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-3 text-right">
          <div className="text-3xl font-semibold tabular-nums text-slate-50">
            {formatValue(sensor.last_value)}
          </div>
          <div className="text-xs text-slate-400">
            {sensor.unit || "no unit"} · updated <TimeAgo iso={sensor.last_updated} />
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      ) : null}

      <section className={cardClass}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-100">Recent readings</h2>
          <span className="text-xs text-slate-500">{total} recorded</span>
        </div>
        <LineChart readings={readings} unit={sensor.unit} />
      </section>

      <section className={cardClass}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-100">Readings</h2>
          <span className="text-xs text-slate-500">newest first</span>
        </div>
        {readings.length === 0 ? (
          <p className="text-sm text-slate-400">No readings recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 pr-4 font-medium">Recorded at</th>
                  <th className="pb-2 pr-4 font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {readings.map((reading) => (
                  <tr key={reading.id} className="text-slate-300">
                    <td className="py-2 pr-4 tabular-nums">{formatTimestamp(reading.recorded_at)}</td>
                    <td className="py-2 pr-4 tabular-nums">
                      {formatValue(reading.value)} {sensor.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isOwner ? (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className={cardClass}>
            <ReadingForm sensors={[sensor]} fixedSensorId={sensor.id} onPosted={() => void load()} />
          </div>

          <div className={cardClass}>
            <h3 className="text-base font-semibold text-slate-100">Delete sensor</h3>
            <p className="mt-1 text-sm text-slate-400">
              Removes <span className="font-medium text-slate-300">{sensor.name}</span> and all of its
              readings. This cannot be undone.
            </p>
            <div className="mt-4">
              {confirmingDelete ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-rose-300">Delete this sensor and its readings?</span>
                  <button
                    type="button"
                    className={dangerButtonClass}
                    onClick={() => void handleDelete()}
                    disabled={deleting}
                  >
                    {deleting ? "Deleting…" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={dangerButtonClass}
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
