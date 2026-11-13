import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, timeAgo, type Reading, type Sensor } from "./api";

export function SensorPage() {
  const { id } = useParams();
  const [sensor, setSensor] = useState<Sensor | null>(null);
  const [readings, setReadings] = useState<Reading[] | null>(null);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(100);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [s, r] = await Promise.all([
        api<Sensor>(`/sensors/${id}`),
        api<{ items: Reading[]; total: number }>(
          `/sensors/${id}/readings?limit=${limit}`,
        ),
      ]);
      setSensor(s);
      setReadings(r.items);
      setTotal(r.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sensor");
    }
  }

  useEffect(() => {
    load();
    const i = setInterval(load, 10_000);
    return () => clearInterval(i);
  }, [id, limit]);

  const chart = useMemo(() => {
    if (!readings || readings.length === 0) return null;
    const width = 720;
    const height = 200;
    const padding = 24;
    const oldestFirst = [...readings].reverse();
    const values = oldestFirst.map((r) => r.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const x = (i: number) =>
      padding + (i / (oldestFirst.length - 1)) * (width - padding * 2);
    const y = (v: number) =>
      padding + (1 - (v - min) / span) * (height - padding * 2);
    const points = oldestFirst
      .map((r, i) => `${x(i)},${y(r.value)}`)
      .join(" ");

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full rounded-lg border border-slate-200 bg-white"
      >
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="#cbd5e1"
          strokeWidth="1"
        />
        <line
          x1={padding}
          y1={padding}
          x2={padding}
          y2={height - padding}
          stroke="#cbd5e1"
          strokeWidth="1"
        />
        <text x={padding} y={height - 4} className="fill-slate-500 text-[10px]">
          {min}
        </text>
        <text x={padding} y={padding - 6} className="fill-slate-500 text-[10px]">
          {max}
        </text>
        <polyline
          points={points}
          fill="none"
          stroke="#4f46e5"
          strokeWidth="2"
        />
        {oldestFirst.map((r, i) => (
          <circle key={r.id} cx={x(i)} cy={y(r.value)} r="2.5" fill="#4f46e5" />
        ))}
      </svg>
    );
  }, [readings]);

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-sm text-red-600">{error}</p>
        <Link to="/" className="mt-4 inline-block text-sm text-indigo-600">
          ← Back
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-sm text-indigo-600 hover:underline">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-bold text-slate-900">
            {sensor?.name ?? "Sensor"}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {sensor && (
          <div className="mb-6 text-sm text-slate-500">
            <span className="font-semibold text-slate-900">
              {sensor.last_value === null
                ? "—"
                : `${sensor.last_value}${sensor.unit ? ` ${sensor.unit}` : ""}`}
            </span>
            {" · "}
            {[sensor.location, `owned by ${sensor.owner}`]
              .filter(Boolean)
              .join(" · ")}
            {" · "}updated {timeAgo(sensor.last_updated)}
          </div>
        )}

        {chart ?? (
          <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
            No readings yet.
          </p>
        )}

        <div className="mt-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Readings{" "}
            <span className="text-sm font-normal text-slate-500">
              ({total} total)
            </span>
          </h2>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {[10, 25, 50, 100, 500].map((n) => (
              <option key={n} value={n}>
                {n} per page
              </option>
            ))}
          </select>
        </div>

        {readings && readings.length > 0 ? (
          <table className="mt-3 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Value</th>
                <th className="px-4 py-2">Recorded at</th>
              </tr>
            </thead>
            <tbody>
              {readings.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-900">
                    {r.value}
                    {sensor?.unit ? ` ${sensor.unit}` : ""}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {new Date(r.recorded_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No readings recorded.</p>
        )}
      </main>
    </div>
  );
}
