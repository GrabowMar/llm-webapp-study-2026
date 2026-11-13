import { useCallback, useState } from "react";
import { api, ApiError, type Reading, type Sensor } from "./api";
import { useAuth } from "./auth";
import { REFRESH_MS } from "./Dashboard";
import { DeleteSensorButton } from "./DeleteSensorButton";
import { ReadingForm } from "./forms";
import { formatDateTime, formatValue, timeAgo, useNow, usePolling } from "./hooks";
import LineChart from "./LineChart";
import { Link, navigate } from "./router";
import { Card, ErrorMessage, errorText } from "./ui";

const LIMIT_OPTIONS = [20, 50, 100, 500];

export default function SensorPage({ id }: { id: number }) {
  const { username } = useAuth();
  const now = useNow(1000);
  const [sensor, setSensor] = useState<Sensor | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    Promise.all([api.getSensor(id), api.listReadings(id, limit)])
      .then(([s, r]) => {
        setSensor(s);
        setReadings(r.items);
        setTotal(r.total);
        setError(null);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError(errorText(err));
      });
  }, [id, limit]);

  usePolling(load, REFRESH_MS);

  if (notFound) {
    return (
      <Card className="text-center">
        <p className="text-slate-700">Sensor not found.</p>
        <Link to="/" className="mt-2 inline-block text-sm font-medium text-indigo-600">
          ← Back to dashboard
        </Link>
      </Card>
    );
  }

  if (!sensor) {
    return (
      <div className="space-y-4">
        <ErrorMessage message={error} />
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  const isOwner = sensor.owner === username;

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
        ← All sensors
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{sensor.name}</h1>
          <p className="text-sm text-slate-500">
            {sensor.location || "No location"} · owned by {sensor.owner}
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-baseline justify-end gap-1">
            <span className="text-4xl font-bold tabular-nums text-slate-900">{formatValue(sensor.last_value)}</span>
            {sensor.unit && <span className="text-lg text-slate-500">{sensor.unit}</span>}
          </div>
          <p className="text-xs text-slate-500">
            {sensor.last_updated ? `Updated ${timeAgo(sensor.last_updated, now)}` : "No readings yet"}
          </p>
        </div>
      </div>

      <ErrorMessage message={error} />

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Recent readings</h2>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Show last
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="rounded-md border-0 py-1 pl-2 pr-7 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600"
            >
              {LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <LineChart readings={readings} unit={sensor.unit} />
      </Card>

      {isOwner && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <ReadingForm sensors={[sensor]} fixedSensorId={sensor.id} onPosted={load} />
          </Card>
          <Card>
            <h2 className="text-base font-semibold text-slate-900">Danger zone</h2>
            <p className="mb-3 mt-1 text-sm text-slate-500">Deleting a sensor also removes all of its readings.</p>
            <DeleteSensorButton sensor={sensor} onDeleted={() => navigate("/")} />
          </Card>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Readings</h2>
          <span className="text-sm text-slate-500">
            showing {readings.length} of {total}
          </span>
        </div>
        {readings.length === 0 ? (
          <p className="border-t border-slate-100 px-5 py-6 text-center text-sm text-slate-500">No readings yet.</p>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto border-t border-slate-100">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-5 py-2 text-left font-medium text-slate-600">Recorded at</th>
                  <th className="px-5 py-2 text-right font-medium text-slate-600">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {readings.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2 text-slate-700">
                      {formatDateTime(r.recorded_at)}
                      <span className="ml-2 text-xs text-slate-400">{timeAgo(r.recorded_at, now)}</span>
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums text-slate-900">
                      {formatValue(r.value)} {sensor.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
