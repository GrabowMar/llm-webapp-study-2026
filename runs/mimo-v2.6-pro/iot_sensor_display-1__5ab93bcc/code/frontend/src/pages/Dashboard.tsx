import { useCallback, useEffect, useState } from "react";
import { deleteSensor, listSensors } from "../api";
import AuthPanel from "../components/AuthPanel";
import ReadingForm from "../components/ReadingForm";
import SensorCard from "../components/SensorCard";
import SensorForm from "../components/SensorForm";
import type { Sensor } from "../types";

export default function Dashboard({
  user,
  navigate,
  onSignedIn,
}: {
  user: string | null;
  navigate: (path: string) => void;
  onSignedIn: (username: string) => void;
}) {
  const [sensors, setSensors] = useState<Sensor[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSensors = useCallback(async () => {
    try {
      const { items } = await listSensors();
      setSensors(items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load sensors");
    }
  }, []);

  useEffect(() => {
    loadSensors();
    const timer = setInterval(loadSensors, 10000);
    return () => clearInterval(timer);
  }, [loadSensors]);

  const own = (sensors ?? []).filter((s) => s.owner === user);

  async function handleDelete(id: number) {
    await deleteSensor(id);
    await loadSensors();
  }

  return (
    <div className="space-y-8">
      {!user ? (
        <section>
          <h2 className="mb-4 text-2xl font-bold text-slate-800">Get started</h2>
          <AuthPanel onSignedIn={onSignedIn} />
        </section>
      ) : (
        <section className="space-y-6">
          <SensorForm onCreated={loadSensors} />
          <ReadingForm sensors={own} onRecorded={loadSensors} />
        </section>
      )}

      <section>
        <h2 className="mb-4 text-2xl font-bold text-slate-800">Sensors</h2>
        {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
        {sensors === null ? (
          <p className="text-slate-500">Loading…</p>
        ) : sensors.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
            No sensors registered yet.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sensors.map((sensor) => (
              <SensorCard
                key={sensor.id}
                sensor={sensor}
                owned={user !== null && sensor.owner === user}
                onOpen={() => navigate(`/sensors/${sensor.id}`)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
