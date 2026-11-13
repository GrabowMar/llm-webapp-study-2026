import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchLoginAttempts } from "../lib/api";
import type { LoginAttempt } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDateTime } from "../lib/format";
import {
  Banner,
  Card,
  PageTitle,
  SecondaryButton,
  useNow,
} from "../components/ui";

export default function AccountPage() {
  const { token, user, refresh } = useAuth();
  const [attempts, setAttempts] = useState<LoginAttempt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const now = useNow(30000);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await fetchLoginAttempts(token);
      setAttempts(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the sign-in attempts.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load, now]);

  return (
    <div className="space-y-6">
      <PageTitle
        title="Your account"
        subtitle={user ? `Signed in as ${user.username}` : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="sm:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Username</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{user?.username ?? "—"}</p>
        </Card>
        <Card className="sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Last sign-in
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {formatDateTime(user?.last_login_at)}
          </p>
          {user?.last_login_at ? null : (
            <p className="mt-1 text-sm text-slate-500">This is your first sign-in.</p>
          )}
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Recent sign-in attempts</h2>
            <p className="text-sm text-slate-500">The 20 most recent attempts, newest first.</p>
          </div>
          <div className="flex gap-2">
            <SecondaryButton
              type="button"
              onClick={() => {
                void refresh();
                void load();
              }}
            >
              Refresh
            </SecondaryButton>
          </div>
        </div>

        {error ? (
          <Banner tone="error" title="Could not load attempts">
            {error}
          </Banner>
        ) : null}

        {!error && attempts.length === 0 && !loading ? (
          <p className="text-sm text-slate-500">No sign-in attempts recorded yet.</p>
        ) : null}

        {attempts.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">When</th>
                  <th className="px-4 py-2.5">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {attempts.map((attempt) => (
                  <tr key={attempt.at + attempt.success}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">
                      {formatDateTime(attempt.at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                          attempt.success
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {attempt.success ? "Success" : "Failed"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
