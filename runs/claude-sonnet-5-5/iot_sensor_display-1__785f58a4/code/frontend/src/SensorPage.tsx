import { useCallback, useEffect, useState } from "react";
import { api, ApiError, formatValue, timeAgo, type Reading, type Sensor, type Session } from "./api";
import Chart from "./Chart";
import { NewReadingForm } from "./Forms";
import { dangerCls, ErrorMsg, Panel } from "./ui";

export default function SensorPage({
  id,
  session,
  navigate,
}: {
  id: number;
  session: Session | null;
  navigate: (path: string) => void;
}) {
  const [sensor, setSensor] = useState<Sensor | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        api<Sensor>(`/sensors/${id}`),
        api<{ items: Reading[]; total: number }>(`/sensors/${id}/readings?limit=50`),
      ]);
      setSensor(s);
      setReadings(r.items);
      setTotal(r.total);
      setError(null);
      setNow(Date.now());
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [id]);

  useEffect(() => {
    setNotFound(false);
    setSensor(null);
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  async function remove() {
    if (!session || !sensor) return;
    if (!window.confirm(`Delete sensor "${sensor.name}" and all its readings?`)) return;
    try {
      await api(`/sensors/${sensor.id}`, { method: "DELETE", token: session.token });
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (notFound) {
    return (
      <div className="space-y-3">
        <p>Sensor not found.</p>
        <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="text-blue-700 hover:underline">
          Back to dashboard
        </a>
      </div>
    );
  }
  if (!sensor) return <p className="text-slate-500">{error ?? "Loading…"}</p>;

  const isOwner = session?.username.toLowerCase() === sensor.owner.toLowerCase();

  return (
    <div className="space-y-6">
      <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="text-sm text-blue-700 hover:underline">
        ← All sensors
      </a>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{sensor.name}</h1>
          <p className="text-sm text-slate-500">
            {sensor.location || "No location"} · owner {sensor.owner}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold">
            {formatValue(sensor.last_value)} <span className="text-lg text-slate-500">{sensor.unit}</span>
          </p>
          <p className="text-sm text-slate-500">updated {timeAgo(sensor.last_updated, now)}</p>
        </div>
      </div>
      <ErrorMsg message={error} />
      <Panel title="Recent readings">
        <Chart readings={readings} unit={sensor.unit} />
      </Panel>
      {isOwner && session && (
        <div className="grid gap-6 md:grid-cols-2">
          <NewReadingForm token={session.token} sensors={[sensor]} fixedId={sensor.id} onDone={load} />
          <Panel title="Danger zone">
            <button className={dangerCls} onClick={remove}>
              Delete sensor
            </button>
          </Panel>
        </div>
      )}
      <Panel title={`Readings (${total})`}>
        {readings.length === 0 ? (
          <p className="text-sm text-slate-500">No readings yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-1 pr-4 font-medium">Time</th>
                <th className="py-1 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {readings.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-1 pr-4">{new Date(r.recorded_at).toLocaleString()}</td>
                  <td className="py-1">
                    {formatValue(r.value)} {sensor.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {total > readings.length && (
          <p className="mt-2 text-xs text-slate-500">Showing the latest {readings.length} readings.</p>
        )}
      </Panel>
    </div>
  );
}
