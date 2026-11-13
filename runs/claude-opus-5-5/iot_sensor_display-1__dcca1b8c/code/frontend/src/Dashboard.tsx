import { useCallback, useState } from "react";
import { api, type Sensor } from "./api";
import { useAuth } from "./auth";
import { DeleteSensorButton } from "./DeleteSensorButton";
import { NewSensorForm, ReadingForm } from "./forms";
import { formatValue, timeAgo, useNow, usePolling } from "./hooks";
import { Link, navigate } from "./router";
import { Card, ErrorMessage, errorText } from "./ui";

export const REFRESH_MS = 10_000;

function SensorCard({ sensor, now, canDelete, onDeleted }: { sensor: Sensor; now: number; canDelete: boolean; onDeleted: () => void }) {
  return (
    <Card className="flex flex-col transition hover:shadow-md hover:ring-indigo-200">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/sensors/${sensor.id}`} className="block truncate text-base font-semibold text-slate-900 hover:text-indigo-600">
            {sensor.name}
          </Link>
          <p className="truncate text-sm text-slate-500">{sensor.location || "No location"}</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{sensor.owner}</span>
      </div>
      <div className="mt-4 flex items-baseline gap-1">
        <span className={`text-4xl font-bold tabular-nums ${sensor.last_value === null ? "text-slate-300" : "text-slate-900"}`}>
          {formatValue(sensor.last_value)}
        </span>
        {sensor.unit && <span className="text-lg text-slate-500">{sensor.unit}</span>}
      </div>
      <p className="mt-1 text-xs text-slate-500" title={sensor.last_updated ?? undefined}>
        {sensor.last_updated ? `Updated ${timeAgo(sensor.last_updated, now)}` : "No readings yet"}
      </p>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <Link to={`/sensors/${sensor.id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
          View history →
        </Link>
        {canDelete && <DeleteSensorButton sensor={sensor} onDeleted={onDeleted} compact />}
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { username } = useAuth();
  const now = useNow(1000);
  const [sensors, setSensors] = useState<Sensor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);

  const load = useCallback(() => {
    api
      .listSensors()
      .then((res) => {
        setSensors(res.items);
        setError(null);
        setLastRefresh(Date.now());
      })
      .catch((err) => setError(errorText(err)));
  }, []);

  usePolling(load, REFRESH_MS);

  const mine = (sensors ?? []).filter((s) => s.owner === username);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sensors</h1>
          <p className="text-sm text-slate-500">
            Live values, refreshed every 10 seconds
            {lastRefresh && ` · last refresh ${timeAgo(new Date(lastRefresh).toISOString(), now)}`}
          </p>
        </div>
      </div>

      <ErrorMessage message={error} />

      {username && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <NewSensorForm
              onCreated={(s) => {
                load();
                navigate(`/sensors/${s.id}`);
              }}
            />
          </Card>
          <Card>
            <ReadingForm sensors={mine} onPosted={load} />
          </Card>
        </div>
      )}

      {sensors === null ? (
        <p className="text-sm text-slate-500">Loading sensors…</p>
      ) : sensors.length === 0 ? (
        <Card className="text-center text-sm text-slate-500">
          No sensors registered yet.
          {!username && (
            <>
              {" "}
              <Link to="/register" className="font-medium text-indigo-600">
                Create an account
              </Link>{" "}
              to add one.
            </>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sensors.map((s) => (
            <SensorCard key={s.id} sensor={s} now={now} canDelete={s.owner === username} onDeleted={load} />
          ))}
        </div>
      )}
    </div>
  );
}
