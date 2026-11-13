import { useCallback, useEffect, useState } from "react";
import { deleteSensor, getSensor, listReadings } from "../api";
import LineChart from "../components/LineChart";
import { formatTimestamp, formatValue, timeAgo } from "../format";
import type { Reading, Sensor } from "../types";

const CHART_LIMIT = 60;

export default function SensorPage({
  id,
  user,
  navigate,
}: {
  id: number;
  user: string | null;
  navigate: (path: string) => void;
}) {
  const [sensor, setSensor] = useState<Sensor | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [total, setTotal] = useState(0);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([getSensor(id), listReadings(id, CHART_LIMIT)]);
      setSensor(s);
      setReadings(r.items);
      setTotal(r.total);
      setNotFound(false);
      setError(null);
    } catch (err) {
      if (err instanceof Error && "status" in err && (err as { status: number }).status === 404) {
        setNotFound(true);
      } else {
        setError(err instanceof Error ? err.message : "Could not load sensor");
      }
    }
  }, [id]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await deleteSensor(id);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete sensor");
      setConfirming(false);
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-lg font-semibold text-slate-800">Sensor not found</p>
        <button
          onClick={() => navigate("/")}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  if (!sensor) {
    return <p className="text-slate-500">{error ?? "Loading…"}</p>;
  }

  const owned = user !== null && sensor.owner === user;
  const points = readings
    .slice()
    .reverse()
    .map((r) => ({ t: new Date(r.recorded_at).getTime(), v: r.value }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            onClick={() => navigate("/")}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            ← All sensors
          </button>
          <h2 className="mt-1 text-3xl font-bold text-slate-800">{sensor.name}</h2>
          <p className="mt-1 text-slate-500">
            {sensor.owner}
            {sensor.location ? ` · ${sensor.location}` : ""}
          </p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">
            {formatValue(sensor.last_value, sensor.unit)}
            <span className="ml-2 text-sm font-normal text-slate-500">
              updated {timeAgo(sensor.last_updated)}
            </span>
          </p>
        </div>

        {owned ? (
          confirming ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDelete}
                disabled={busy}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Confirm delete
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Delete sensor
            </button>
          )
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section>
        <h3 className="mb-3 text-lg font-semibold text-slate-800">Recent readings</h3>
        <LineChart points={points} unit={sensor.unit} />
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold text-slate-800">History</h3>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Recorded at</th>
                <th className="px-4 py-3 font-medium">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {readings.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-slate-500">
                    No readings recorded yet.
                  </td>
                </tr>
              ) : (
                readings.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 text-slate-700">{formatTimestamp(r.recorded_at)}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {formatValue(r.value, sensor.unit)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Showing {readings.length} of {total} reading{total === 1 ? "" : "s"} (newest first).
        </p>
      </section>
    </div>
  );
}
