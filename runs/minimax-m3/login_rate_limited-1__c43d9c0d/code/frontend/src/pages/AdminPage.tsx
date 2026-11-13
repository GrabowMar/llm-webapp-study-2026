import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchLocks, unlockUser } from "../lib/api";
import type { Lock } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDateTime, formatDuration } from "../lib/format";
import { Banner, Card, PageTitle, SecondaryButton, useNow } from "../components/ui";

export default function AdminPage() {
  const { token } = useAuth();
  const [locks, setLocks] = useState<Lock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const now = useNow();

  const load = useCallback(async () => {
    if (!token) {
      setError("Sign in as the admin to see the locked usernames.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchLocks(token);
      setLocks(data.items);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Your session expired. Sign in again.");
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Only the admin can see the locked usernames.");
      } else {
        setError("Could not load the locked usernames.");
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onUnlock(username: string) {
    if (!token) return;
    setBusyUser(username);
    try {
      await unlockUser(token, username);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not unlock that username.");
    } finally {
      setBusyUser(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title="Locked usernames"
        subtitle="Usernames locked after 5 consecutive failed sign-ins. Unlock them to let the owner sign in again."
      />

      <Card>
        {error ? (
          <div className="mb-4">
            <Banner tone="error" title="Admin">
              {error}
            </Banner>
          </div>
        ) : null}

        {locks.length === 0 && !loading ? (
          <p className="text-sm text-slate-500">No usernames are locked right now.</p>
        ) : null}

        {locks.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Username</th>
                  <th className="px-4 py-2.5">Locked until</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {locks.map((lock) => {
                  const remaining = Math.max(
                    0,
                    Math.ceil((new Date(lock.locked_until).getTime() - now) / 1000),
                  );
                  return (
                    <tr key={lock.username}>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{lock.username}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">
                        {formatDateTime(lock.locked_until)}
                        <span className="ml-2 text-xs text-slate-500">
                          (in {formatDuration(remaining)})
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <SecondaryButton
                          type="button"
                          onClick={() => void onUnlock(lock.username)}
                          disabled={busyUser === lock.username}
                          className="px-3 py-1.5"
                        >
                          {busyUser === lock.username ? "Unlocking…" : "Unlock"}
                        </SecondaryButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
