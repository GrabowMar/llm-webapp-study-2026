import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Sensor } from "../api";
import { useAuth } from "../auth";
import SensorCard from "../components/SensorCard";
import SensorForm from "../components/SensorForm";

export default function DashboardPage() {
  const { username } = useAuth();
  const [sensors, setSensors] = useState<Sensor[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.listSensors();
      setSensors(res.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load sensors");
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Sensors</h1>
        <span className="text-sm text-slate-400">auto-refreshes every 10 s</span>
      </div>

      {username && <SensorForm onSaved={load} />}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {sensors !== null && sensors.length === 0 && !error && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          No sensors registered yet.
          {username ? " Register one above." : " Sign in to register one."}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(sensors ?? []).map((s) => (
          <SensorCard
            key={s.id}
            sensor={s}
            isMine={username !== null && s.owner === username}
            onChanged={load}
          />
        ))}
      </div>
    </div>
  );
}
