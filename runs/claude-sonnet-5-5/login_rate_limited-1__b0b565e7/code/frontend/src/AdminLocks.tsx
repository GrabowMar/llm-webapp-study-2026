import { useCallback, useEffect, useState } from "react";
import { api, type Lock } from "./api";

export default function AdminLocks() {
  const [locks, setLocks] = useState<Lock[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ items: Lock[] }>("/admin/locks")
      .then((r) => setLocks(r.items))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  const unlock = async (username: string) => {
    setError(null);
    try {
      await api(`/admin/locks/${encodeURIComponent(username)}/unlock`, { method: "POST" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unlock failed");
    }
    load();
  };

  return (
    <section className="rounded bg-white p-4 shadow">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Locked usernames</h2>
        <button onClick={load} className="text-sm text-indigo-600 hover:underline">
          Refresh
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {locks.length === 0 ? (
        <p className="text-sm text-slate-500">No usernames are locked.</p>
      ) : (
        <ul className="divide-y divide-slate-200 text-sm">
          {locks.map((l) => (
            <li key={l.username} className="flex items-center justify-between py-2">
              <span>
                <strong>{l.username}</strong> until{" "}
                {new Date(l.locked_until).toLocaleTimeString()}
              </span>
              <button
                onClick={() => unlock(l.username)}
                className="rounded bg-red-600 px-3 py-1 text-white hover:bg-red-700"
              >
                Unlock
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
