import { useCallback, useEffect, useRef, useState } from "react";
import {
  Account,
  ApiError,
  Lock,
  LoginAttempt,
  fetchAttempts,
  fetchLocks,
  fetchMe,
  formatCountdown,
  formatDate,
  getToken,
  login,
  logout,
  register,
  setToken,
  unlockUser,
} from "./api";

type View = "auth" | "account" | "admin";

function useRetryCountdown() {
  const [seconds, setSeconds] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, []);

  const start = useCallback((initial: number) => {
    if (timer.current !== null) window.clearInterval(timer.current);
    let remaining = Math.max(0, Math.ceil(initial));
    setSeconds(remaining);
    timer.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        setSeconds(null);
        if (timer.current !== null) window.clearInterval(timer.current);
        timer.current = null;
      } else {
        setSeconds(remaining);
      }
    }, 1000);
  }, []);

  const clear = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    setSeconds(null);
  }, []);

  return { seconds, start, clear };
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      <input
        {...props}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
      />
    </label>
  );
}

function Notice({
  kind,
  children,
}: {
  kind: "error" | "success" | "info";
  children: React.ReactNode;
}) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-amber-200 bg-amber-50 text-amber-900",
  }[kind];
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>
      {children}
    </div>
  );
}

function AuthPanel({
  onSignedIn,
}: {
  onSignedIn: (account: Account) => void;
}) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clientBlocked, setClientBlocked] = useState(false);
  const retry = useRetryCountdown();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setClientBlocked(false);
    retry.clear();
    setBusy(true);
    try {
      if (mode === "register") {
        await register(username.trim(), password);
        setInfo("Account created. You can sign in now.");
        setMode("signin");
        setPassword("");
        return;
      }
      const result = await login(username.trim(), password);
      setToken(result.token);
      const account = await fetchMe();
      onSignedIn(account);
      setPassword("");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          const wait = err.retryAfter ?? 60;
          retry.start(wait);
          if (err.code === "account_locked") {
            setError(
              `This account is locked after too many failed sign-ins. Try again in ${formatCountdown(wait)}.`,
            );
          } else {
            setClientBlocked(true);
            setError(
              `Too many sign-in attempts from this client. Try again in ${formatCountdown(wait)}.`,
            );
          }
        } else {
          setError(err.message);
        }
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-6 flex rounded-xl bg-slate-100 p-1">
        {(["signin", "register"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setMode(tab);
              setError(null);
              setInfo(null);
              setClientBlocked(false);
              retry.clear();
            }}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              mode === tab
                ? "bg-white text-indigo-700 shadow"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab === "signin" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>

      <form
        onSubmit={submit}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-xl font-bold text-slate-900">
          {mode === "signin" ? "Welcome back" : "Create an account"}
        </h2>

        {error && <Notice kind="error">{error}</Notice>}
        {info && <Notice kind="success">{info}</Notice>}
        {retry.seconds !== null && (
          <Notice kind="info">
            You can try again in {formatCountdown(retry.seconds)}.
          </Notice>
        )}

        <Field
          label="Username"
          value={username}
          autoComplete="username"
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <Field
          label="Password"
          type="password"
          value={password}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button
          type="submit"
          disabled={busy || (clientBlocked && retry.seconds !== null)}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white shadow transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? "Please wait…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>
    </div>
  );
}

function AccountPage({ account }: { account: Account }) {
  const [attempts, setAttempts] = useState<LoginAttempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchAttempts()
      .then((data) => {
        if (active) setAttempts(data.items);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof ApiError ? err.message : "Failed to load.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Account</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Username
            </dt>
            <dd className="mt-1 text-slate-900">{account.username}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Last sign-in
            </dt>
            <dd className="mt-1 text-slate-900">
              {formatDate(account.last_login_at)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Recent sign-in attempts</h2>
        {error && (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        )}
        {attempts === null && !error && (
          <p className="mt-3 text-sm text-slate-500">Loading…</p>
        )}
        {attempts !== null && attempts.length === 0 && (
          <p className="mt-3 text-sm text-slate-500">No sign-in attempts yet.</p>
        )}
        {attempts !== null && attempts.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100">
            {attempts.map((attempt, index) => (
              <li
                key={`${attempt.at}-${index}`}
                className="flex items-center justify-between py-3"
              >
                <span className="text-sm text-slate-700">
                  {formatDate(attempt.at)}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    attempt.success
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {attempt.success ? "Success" : "Failed"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AdminPage() {
  const [locks, setLocks] = useState<Lock[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchLocks()
      .then((data) => setLocks(data.items))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Failed to load.");
      });
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 15000);
    return () => window.clearInterval(id);
  }, [load]);

  const unlock = async (username: string) => {
    setBusy(username);
    setError(null);
    try {
      await unlockUser(username);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to unlock.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Locked accounts</h2>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {locks === null && !error && (
        <p className="mt-3 text-sm text-slate-500">Loading…</p>
      )}
      {locks !== null && locks.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">No accounts are locked.</p>
      )}
      {locks !== null && locks.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100">
          {locks.map((lock) => (
            <li
              key={lock.username}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="font-medium text-slate-900">{lock.username}</p>
                <p className="text-sm text-slate-500">
                  Locked until {formatDate(lock.locked_until)}
                </p>
              </div>
              <button
                type="button"
                disabled={busy === lock.username}
                onClick={() => unlock(lock.username)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy === lock.username ? "Unlocking…" : "Unlock"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function App() {
  const [account, setAccount] = useState<Account | null>(null);
  const [view, setView] = useState<View>("auth");
  const [checking, setChecking] = useState<boolean>(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    let active = true;
    fetchMe()
      .then((data) => {
        if (!active) return;
        setAccount(data);
        setView(data.username === "admin" ? "admin" : "account");
      })
      .catch(() => {
        if (!active) return;
        setToken(null);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSignOut = () => {
    logout();
    setAccount(null);
    setView("auth");
  };

  const isAdmin = account?.username === "admin";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <h1 className="text-lg font-extrabold tracking-tight text-slate-900">
            Account Service
          </h1>
          {account && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as{" "}
                <span className="font-semibold text-slate-900">
                  {account.username}
                </span>
              </span>
              {isAdmin && (
                <nav className="flex gap-1 rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setView("admin")}
                    className={`rounded-md px-3 py-1 text-sm font-medium transition ${
                      view === "admin"
                        ? "bg-white text-indigo-700 shadow"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("account")}
                    className={`rounded-md px-3 py-1 text-sm font-medium transition ${
                      view === "account"
                        ? "bg-white text-indigo-700 shadow"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Account
                  </button>
                </nav>
              )}
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {checking ? (
          <p className="text-center text-sm text-slate-500">Loading…</p>
        ) : !account ? (
          <AuthPanel
            onSignedIn={(next) => {
              setAccount(next);
              setView(next.username === "admin" ? "admin" : "account");
            }}
          />
        ) : view === "admin" && isAdmin ? (
          <div className="space-y-6">
            <AdminPage />
            <AccountPage account={account} />
          </div>
        ) : (
          <AccountPage account={account} />
        )}
      </main>
    </div>
  );
}
