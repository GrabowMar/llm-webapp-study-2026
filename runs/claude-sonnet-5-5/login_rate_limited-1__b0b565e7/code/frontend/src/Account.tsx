import { useEffect, useState } from "react";
import { api, type Attempt, type Me } from "./api";

export default function Account() {
  const [me, setMe] = useState<Me | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<Me>("/me"),
      api<{ items: Attempt[] }>("/me/login-attempts"),
    ])
      .then(([m, a]) => {
        setMe(m);
        setAttempts(a.items);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <section className="rounded bg-white p-4 shadow">
      <h2 className="mb-2 text-lg font-semibold">Account</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {me && (
        <p className="mb-4 text-sm">
          Last sign-in:{" "}
          <span data-testid="last-login">
            {me.last_login_at ? new Date(me.last_login_at).toLocaleString() : "never"}
          </span>
        </p>
      )}
      <h3 className="mb-1 font-medium">Recent sign-in attempts</h3>
      {attempts.length === 0 ? (
        <p className="text-sm text-slate-500">No attempts yet.</p>
      ) : (
        <ul className="divide-y divide-slate-200 text-sm" data-testid="attempts">
          {attempts.map((a, i) => (
            <li key={i} className="flex justify-between py-1">
              <span>{new Date(a.at).toLocaleString()}</span>
              <span className={a.success ? "text-green-700" : "text-red-600"}>
                {a.success ? "Success" : "Failed"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
