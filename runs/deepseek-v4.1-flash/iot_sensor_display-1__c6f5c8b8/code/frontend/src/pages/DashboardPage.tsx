import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { deleteSensor, listSensors, type Sensor } from "../api";
import { useAuth } from "../auth";
import ReadingForm from "../components/ReadingForm";
import SensorCard from "../components/SensorCard";
import SensorForm from "../components/SensorForm";

const REFRESH_MS = 10_000;

export default function DashboardPage() {
  const { username, isSignedIn } = useAuth();
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const mounted = useRef(true);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setLoading(true);
    }
    try {
      const data = await listSensors();
      if (!mounted.current) {
        return;
      }
      setSensors(data.items);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : "Could not load sensors");
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load(true);
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [load]);

  const ownSensors = isSignedIn
    ? sensors.filter((sensor) => sensor.owner === username)
    : [];

  async function handleDelete(sensor: Sensor) {
    const confirmed = window.confirm(
      `Delete "${sensor.name}" and all of its readings? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }
    setActionError(null);
    setDeletingId(sensor.id);
    try {
      await deleteSensor(sensor.id);
      setSensors((current) => current.filter((item) => item.id !== sensor.id));
      await load();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not delete sensor",
      );
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = sensors.filter((sensor) => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return true;
    }
    return (
      sensor.name.toLowerCase().includes(needle) ||
      sensor.location.toLowerCase().includes(needle) ||
      sensor.owner.toLowerCase().includes(needle)
    );
  });

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Sensor dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Live latest values from every registered sensor.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm ring-1 ring-slate-200">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Auto-refresh 10s
            {lastRefresh && (
              <span className="text-slate-400">
                · {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </span>
        </div>
      </section>

      {(error || actionError) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error ?? actionError}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Sensors
              <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">
                {sensors.length}
              </span>
            </h2>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter sensors…"
              className="w-48 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {loading && sensors.length === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((key) => (
                <div
                  key={key}
                  className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-xl font-bold text-slate-400">
                +
              </span>
              <h3 className="mt-3 text-lg font-semibold text-slate-800">
                {sensors.length === 0
                  ? "No sensors registered yet"
                  : "No sensors match your filter"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {sensors.length === 0
                  ? isSignedIn
                    ? "Use the form to register your first sensor."
                    : "Sign in to register a sensor and start posting readings."
                  : "Try a different search term."}
              </p>
              {!isSignedIn && sensors.length === 0 && (
                <Link
                  to="/login"
                  className="mt-5 inline-block rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400"
                >
                  Sign in
                </Link>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filtered.map((sensor) => (
                <SensorCard
                  key={sensor.id}
                  sensor={sensor}
                  canManage={isSignedIn && sensor.owner === username}
                  onDelete={handleDelete}
                  deleting={deletingId === sensor.id}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-6">
          {isSignedIn ? (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  New sensor
                </h2>
                <div className="mt-3">
                  <SensorForm onCreated={() => void load()} />
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Post a reading
                </h2>
                <div className="mt-3">
                  <ReadingForm
                    sensors={ownSensors}
                    onPosted={() => void load()}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Get started
              </h2>
              <p className="mt-3 text-sm text-slate-500">
                Sign in to register sensors, post readings, and manage the ones
                you own.
              </p>
              <div className="mt-4 flex gap-2">
                <Link
                  to="/login"
                  className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400"
                >
                  Register
                </Link>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
