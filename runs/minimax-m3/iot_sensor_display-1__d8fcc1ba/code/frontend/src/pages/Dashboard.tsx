import { useCallback, useEffect, useState } from "react";
import { listSensors, type Sensor } from "../api";
import { useAuth } from "../auth";
import AuthPanel from "../components/AuthPanel";
import ReadingForm from "../components/ReadingForm";
import SensorCard from "../components/SensorCard";
import SensorForm from "../components/SensorForm";

const REFRESH_MS = 10_000;

export default function Dashboard() {
  const { username } = useAuth();
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await listSensors();
      setSensors(result.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load sensors");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const ownedSensors = username ? sensors.filter((sensor) => sensor.owner === username) : [];

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      {error ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      ) : null}

      {username ? (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <SensorForm onCreated={() => void load()} />
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <ReadingForm sensors={ownedSensors} onPosted={() => void load()} />
          </div>
        </section>
      ) : (
        <AuthPanel />
      )}

      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold text-slate-100">Sensors</h2>
          <span className="text-xs uppercase tracking-wide text-slate-500">
            {sensors.length} registered · refreshes every 10 seconds
          </span>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
            Loading sensors…
          </div>
        ) : sensors.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
            No sensors registered yet.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sensors.map((sensor) => (
              <SensorCard key={sensor.id} sensor={sensor} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
