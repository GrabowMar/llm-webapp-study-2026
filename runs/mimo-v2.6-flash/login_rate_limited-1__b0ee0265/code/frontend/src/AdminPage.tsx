import { useCallback, useEffect, useState } from "react";
import type { Lock } from "./api";
import { formatWhen } from "./format";
import { messageFrom, request } from "./api";

type Props = {
  token: string;
  onUnauthorized: () => void;
};

export default function AdminPage({ token, onUnauthorized }: Props) {
  const [locks, setLocks] = useState<Lock[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await request<{ items: Lock[] }>("/api/admin/locks", {
      token,
    });
    if (result.status === 401) {
      onUnauthorized();
      return;
    }
    if (result.status === 200 && result.data) {
      setLocks(result.data.items);
      setFailure(null);
      return;
    }
    setLocks([]);
    setFailure(messageFrom(result));
  }, [token, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  async function unlock(username: string) {
    if (busy) {
      return;
    }
    setBusy(username);
    const result = await request(
      `/api/admin/locks/${encodeURIComponent(username)}/unlock`,
      { method: "POST", token },
    );
    setBusy(null);
    if (result.status === 401) {
      onUnauthorized();
      return;
    }
    if (result.status !== 200) {
      setFailure(messageFrom(result));
      return;
    }
    await load();
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Locked usernames
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Sign-ins for these usernames are refused until the lock expires.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {failure && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {failure}
        </p>
      )}

      {!failure && locks === null && (
        <p className="mt-4 text-sm text-slate-500">Loading...</p>
      )}

      {!failure && locks !== null && locks.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">
          No usernames are currently locked.
        </p>
      )}

      {!failure && locks !== null && locks.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Username</th>
                <th className="py-2 pr-4 font-medium">Locked until</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {locks.map((lock) => (
                <tr
                  key={lock.username}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="py-2 pr-4 font-medium text-slate-900">
                    {lock.username}
                  </td>
                  <td className="py-2 pr-4 text-slate-700">
                    {formatWhen(lock.locked_until)}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void unlock(lock.username)}
                      disabled={busy !== null}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busy === lock.username ? "Unlocking..." : "Unlock"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
