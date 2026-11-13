import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Sensor } from "./api";
import { useAuth } from "./auth";
import { SensorForm } from "./SensorForm";
import { ReadingForm } from "./ReadingForm";
import { SensorCard } from "./SensorCard";

export function Dashboard() {
  const { token, username, signOut } = useAuth();
  const [sensors, setSensors] = useState<Sensor[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api<{ items: Sensor[] }>("/sensors");
      setSensors(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sensors");
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold text-slate-900">Sensor Dashboard</h1>
          {username ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as{" "}
                <span className="font-semibold text-slate-900">{username}</span>
              </span>
              <button
                onClick={signOut}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {username && (
          <div className="mb-8 space-y-4">
            <SensorForm onCreated={load} />
            {sensors && sensors.some((s) => s.owner === username) && (
              <ReadingForm sensors={sensors} onPosted={load} />
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {sensors === null ? (
          <p className="text-slate-500">Loading…</p>
        ) : sensors.length === 0 ? (
          <p className="text-slate-500">No sensors yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sensors.map((s) => (
              <SensorCard key={s.id} sensor={s} onDeleted={load} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
