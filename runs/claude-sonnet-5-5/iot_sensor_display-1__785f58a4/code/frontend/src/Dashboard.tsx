import { useCallback, useEffect, useState } from "react";
import { api, formatValue, timeAgo, type Sensor, type Session } from "./api";
import { NewReadingForm, NewSensorForm } from "./Forms";
import { dangerCls, ErrorMsg } from "./ui";

export default function Dashboard({
  session,
  navigate,
}: {
  session: Session | null;
  navigate: (path: string) => void;
}) {
  const [sensors, setSensors] = useState<Sensor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const res = await api<{ items: Sensor[] }>("/sensors");
      setSensors(res.items);
      setError(null);
      setNow(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sensors");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  async function remove(s: Sensor) {
    if (!session) return;
    if (!window.confirm(`Delete sensor "${s.name}" and all its readings?`)) return;
    try {
      await api(`/sensors/${s.id}`, { method: "DELETE", token: session.token });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const mine = session
    ? (sensors ?? []).filter((s) => s.owner.toLowerCase() === session.username.toLowerCase())
    : [];

  return (
    <div className="space-y-6">
      <ErrorMsg message={error} />
      {sensors === null ? (
        <p className="text-slate-500">Loading…</p>
      ) : sensors.length === 0 ? (
        <p className="text-slate-500">No sensors yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sensors.map((s) => (
            <article key={s.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="font-semibold">
                <a
                  href={`/sensors/${s.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/sensors/${s.id}`);
                  }}
                  className="text-blue-700 hover:underline"
                >
                  {s.name}
                </a>
              </h3>
              <p className="my-2 text-3xl font-semibold">
                {formatValue(s.last_value)} <span className="text-lg text-slate-500">{s.unit}</span>
              </p>
              <p className="text-sm text-slate-500">{s.location || "No location"}</p>
              <p className="text-sm text-slate-500">updated {timeAgo(s.last_updated, now)}</p>
              {session && s.owner.toLowerCase() === session.username.toLowerCase() && (
                <button className={`${dangerCls} mt-3`} onClick={() => remove(s)}>
                  Delete
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {session && (
        <div className="grid gap-6 md:grid-cols-2">
          <NewSensorForm token={session.token} onDone={load} />
          <NewReadingForm token={session.token} sensors={mine} onDone={load} />
        </div>
      )}
    </div>
  );
}
