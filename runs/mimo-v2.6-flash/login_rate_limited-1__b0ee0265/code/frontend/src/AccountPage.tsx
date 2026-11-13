import { useCallback, useEffect, useState } from "react";
import type { Account, LoginAttempt } from "./api";
import { formatWhen } from "./format";
import { messageFrom, request } from "./api";

type Props = {
  user: Account;
  token: string;
  onUnauthorized: () => void;
};

export default function AccountPage({ user, token, onUnauthorized }: Props) {
  const [attempts, setAttempts] = useState<LoginAttempt[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await request<{ items: LoginAttempt[] }>(
      "/api/me/login-attempts",
      { token },
    );
    if (result.status === 401) {
      onUnauthorized();
      return;
    }
    if (result.status === 200 && result.data) {
      setAttempts(result.data.items);
      setFailure(null);
      return;
    }
    setFailure(messageFrom(result));
  }, [token, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">Account</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-slate-500">Username</dt>
            <dd className="mt-1 text-base text-slate-900">
              {user.username}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-500">
              Last sign-in
            </dt>
            <dd className="mt-1 text-base text-slate-900">
              {formatWhen(user.last_login_at)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Recent sign-in attempts
          </h2>
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

        {!failure && attempts === null && (
          <p className="mt-4 text-sm text-slate-500">Loading...</p>
        )}

        {!failure && attempts !== null && attempts.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">
            No sign-in attempts yet.
          </p>
        )}

        {!failure && attempts !== null && attempts.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4 font-medium">Time</th>
                  <th className="py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((attempt, index) => (
                  <tr
                    key={`${attempt.at}-${index}`}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="py-2 pr-4 text-slate-700">
                      {formatWhen(attempt.at)}
                    </td>
                    <td className="py-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          attempt.success
                            ? "bg-emerald-100 text-emerald-800"
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
        )}
      </section>
    </div>
  );
}
