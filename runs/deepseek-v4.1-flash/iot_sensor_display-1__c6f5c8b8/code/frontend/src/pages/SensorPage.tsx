import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  deleteSensor,
  getSensor,
  listReadings,
  type Reading,
  type Sensor,
} from "../api";
import { useAuth } from "../auth";
import ReadingForm from "../components/ReadingForm";
import { formatDateTime, formatTime, formatValue } from "../format";

type ChartPoint = {
  label: string;
  value: number;
  recordedAt: string;
};

export default function SensorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { username, isSignedIn } = useAuth();

  const [sensor, setSensor] = useState<Sensor | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(
    async (showSpinner = false) => {
      if (!id) {
        return;
      }
      if (showSpinner) {
        setLoading(true);
      }
      try {
        const [sensorData, readingData] = await Promise.all([
          getSensor(id),
          listReadings(id, limit),
        ]);
        if (!mounted.current) {
          return;
        }
        setSensor(sensorData);
        setReadings(readingData.items);
        setTotal(readingData.total);
        setNotFound(false);
        setError(null);
      } catch (err) {
        if (!mounted.current) {
          return;
        }
        if (err instanceof Error && "status" in err && (err as { status: number }).status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof Error ? err.message : "Could not load sensor");
        }
      } finally {
        if (mounted.current) {
          setLoading(false);
        }
      }
    },
    [id, limit],
  );

  useEffect(() => {
    mounted.current = true;
    void load(true);
    const timer = window.setInterval(() => void load(), 10_000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [load]);

  const canManage = Boolean(
    isSignedIn && sensor && sensor.owner === username,
  );

  async function handleDelete() {
    if (!sensor) {
      return;
    }
    const confirmed = window.confirm(
      `Delete "${sensor.name}" and all of its readings? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }
    setDeleting(true);
    try {
      await deleteSensor(sensor.id);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete sensor");
      setDeleting(false);
    }
  }

  const chartData: ChartPoint[] = [...readings]
    .sort(
      (a, b) =>
        new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
    )
    .map((reading) => ({
      label: formatTime(reading.recorded_at),
      value: reading.value,
      recordedAt: reading.recorded_at,
    }));

  const values = readings.map((reading) => reading.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const stats = {
    min,
    max,
    avg: values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null,
  };

  if (notFound) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
        <p className="text-5xl font-black text-slate-300">404</p>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">
          Sensor not found
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          It may have been deleted by its owner.
        </p>
        <Link
          to="/"
          className="mt-5 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/"
          className="text-sm font-medium text-slate-500 transition hover:text-slate-800"
        >
          ← Dashboard
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading && !sensor ? (
        <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      ) : sensor ? (
        <>
          <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {sensor.name}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {sensor.location || "No location"} · owned by{" "}
                <span className="font-medium text-slate-700">{sensor.owner}</span>
              </p>
            </div>
            <div className="flex items-end gap-6">
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Latest
                </p>
                <p className="text-3xl font-bold text-slate-900">
                  {formatValue(sensor.last_value)}
                  {sensor.unit && (
                    <span className="ml-1 text-sm font-medium text-slate-500">
                      {sensor.unit}
                    </span>
                  )}
                </p>
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-100 disabled:opacity-40"
                >
                  {deleting ? "Deleting…" : "Delete sensor"}
                </button>
              )}
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Lowest (recent)", value: stats.min, unit: sensor.unit },
              { label: "Highest (recent)", value: stats.max, unit: sensor.unit },
              { label: "Average (recent)", value: stats.avg, unit: sensor.unit },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {stat.label}
                </p>
                <p className="mt-1 text-xl font-semibold text-slate-800">
                  {formatValue(stat.value)}
                  {stat.unit && stat.value !== null && (
                    <span className="ml-1 text-xs font-medium text-slate-500">
                      {stat.unit}
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Recent readings
                  </h2>
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    Show
                    <select
                      value={limit}
                      onChange={(event) => setLimit(Number(event.target.value))}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
                    >
                      {[10, 25, 50, 100, 200].map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    of {total}
                  </label>
                </div>

                {chartData.length === 0 ? (
                  <div className="grid h-64 place-items-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
                    No readings yet
                  </div>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chartData}
                        margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: "#94a3b8" }}
                          tickLine={false}
                          axisLine={{ stroke: "#e2e8f0" }}
                          minTickGap={24}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#94a3b8" }}
                          tickLine={false}
                          axisLine={false}
                          domain={["auto", "auto"]}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 12,
                            border: "1px solid #e2e8f0",
                            fontSize: 12,
                          }}
                          formatter={(value) => [
                            `${formatValue(Number(value))}${sensor.unit ? ` ${sensor.unit}` : ""}`,
                            "Value",
                          ]}
                          labelFormatter={(_label, payload) => {
                            const point = payload?.[0]?.payload as
                              | ChartPoint
                              | undefined;
                            return point ? formatDateTime(point.recordedAt) : "";
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="#10b981"
                          strokeWidth={2}
                          dot={chartData.length < 40}
                          activeDot={{ r: 4 }}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>

              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Readings table
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3 font-semibold">#</th>
                        <th className="px-5 py-3 font-semibold">Value</th>
                        <th className="px-5 py-3 font-semibold">Recorded at</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {readings.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-5 py-10 text-center text-slate-400"
                          >
                            No readings recorded yet.
                          </td>
                        </tr>
                      ) : (
                        readings.map((reading, index) => (
                          <tr
                            key={reading.id}
                            className="transition hover:bg-slate-50"
                          >
                            <td className="px-5 py-3 text-slate-400">
                              {index + 1}
                            </td>
                            <td className="px-5 py-3 font-semibold text-slate-800">
                              {formatValue(reading.value)}
                              {sensor.unit && (
                                <span className="ml-1 text-xs font-medium text-slate-500">
                                  {sensor.unit}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-slate-500">
                              {formatDateTime(reading.recorded_at)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <aside className="space-y-6">
              {canManage ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Post a reading
                  </h2>
                  <div className="mt-3">
                    <ReadingForm
                      sensors={[sensor]}
                      presetSensorId={sensor.id}
                      onPosted={() => void load()}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
                  {isSignedIn
                    ? "Only the owner can post readings to this sensor."
                    : "Sign in as the owner to post readings to this sensor."}
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Details
                </h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Sensor ID</dt>
                    <dd className="font-medium text-slate-800">{sensor.id}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Unit</dt>
                    <dd className="font-medium text-slate-800">
                      {sensor.unit || "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Location</dt>
                    <dd className="text-right font-medium text-slate-800">
                      {sensor.location || "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Last updated</dt>
                    <dd className="text-right font-medium text-slate-800">
                      {formatDateTime(sensor.last_updated)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Total readings</dt>
                    <dd className="font-medium text-slate-800">{total}</dd>
                  </div>
                </dl>
              </div>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}
