import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import type { Reading, Sensor } from "../api";
import { useAuth } from "../auth";
import { formatTime, formatValue, timeAgo } from "../format";

const CHART_LIMIT = 100;

export default function SensorPage() {
  const { id } = useParams();
  const sensorId = Number(id);
  const navigate = useNavigate();
  const { username } = useAuth();
  const [sensor, setSensor] = useState<Sensor | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isInteger(sensorId) || sensorId < 1) {
      setNotFound(true);
      return;
    }
    try {
      const [s, r] = await Promise.all([
        api.getSensor(sensorId),
        api.listReadings(sensorId, CHART_LIMIT),
      ]);
      setSensor(s);
      setReadings(r.items);
      setTotal(r.total);
      setError(null);
    } catch (err) {
      if (err instanceof Error && "status" in err && err.status === 404) setNotFound(true);
      else setError(err instanceof Error ? err.message : "failed to load sensor");
    }
  }, [sensorId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [load]);

  if (notFound) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-white p-6 text-slate-600 shadow">
          Sensor #{id ?? "?"} does not exist.
        </p>
        <Link to="/" className="text-emerald-600 hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  if (!sensor) {
    return <p className="text-slate-500">{error ?? "Loading sensor…"}</p>;
  }

  const isMine = username !== null && sensor.owner === username;
  const chartData = [...readings].reverse();

  async function remove() {
    if (!sensor) return;
    if (
      !window.confirm(`Delete sensor “${sensor.name}” and all of its readings?`)
    )
      return;
    await api.deleteSensor(sensor.id);
    navigate("/");
  }

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-block text-sm text-emerald-600 hover:underline">
        ← All sensors
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{sensor.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              owner <strong className="text-slate-700">{sensor.owner}</strong>
              {sensor.location && <> · {sensor.location}</>}
              {sensor.unit && <> · unit {sensor.unit}</>}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-emerald-600">
              {formatValue(sensor.last_value, sensor.unit)}
            </p>
            <p className="text-xs text-slate-400">{timeAgo(sensor.last_updated)}</p>
          </div>
        </div>
        {isMine && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <PostReadingForm sensor={sensor} onSaved={load} />
            <button
              onClick={remove}
              className="ml-auto rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Delete sensor
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Recent readings
        </h2>
        {chartData.length === 0 ? (
          <p className="py-10 text-center text-slate-400">No readings yet.</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="recorded_at"
                  tickFormatter={(v: string) =>
                    new Date(v).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  minTickGap={30}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  width={56}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                />
                <Tooltip
                  labelFormatter={(v) => formatTime(String(v))}
                  formatter={(value: unknown) => [
                    formatValue(Number(value), sensor.unit),
                    "Value",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#059669"
                  strokeWidth={2}
                  dot={chartData.length <= 40 ? { r: 3, fill: "#059669" } : false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Readings{" "}
          <span className="font-normal normal-case text-slate-400">
            (showing {readings.length} of {total})
          </span>
        </h2>
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-2 font-medium">Time</th>
              <th className="px-5 py-2 font-medium">Value</th>
              <th className="px-5 py-2 font-medium">Age</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {readings.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-5 py-2 text-slate-700">{formatTime(r.recorded_at)}</td>
                <td className="px-5 py-2 font-medium text-slate-900">
                  {formatValue(r.value, sensor.unit)}
                </td>
                <td className="px-5 py-2 text-slate-500">{timeAgo(r.recorded_at)}</td>
              </tr>
            ))}
            {readings.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-6 text-center text-slate-400">
                  No readings yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PostReadingForm({ sensor, onSaved }: { sensor: Sensor; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const number = Number(value);
    if (value.trim() === "" || Number.isNaN(number)) {
      setError("Enter a numeric value.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.createReading(sensor.id, number);
      setValue("");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not post reading");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        type="number"
        step="any"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={sensor.unit ? `value (${sensor.unit})` : "value"}
        className="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {busy ? "Posting…" : "Post reading"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
