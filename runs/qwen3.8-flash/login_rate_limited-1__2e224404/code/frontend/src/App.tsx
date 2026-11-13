import { useCallback, useEffect, useState } from "react";
import { type FormEvent, type ReactNode } from "react";
import {
  api,
  type ApiError,
  formatInstant,
  getToken,
  isApiError,
  type Lock,
  type LoginAttempt,
  type Me,
  retryMessage,
  setToken,
} from "./api";

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
const buttonClass =
  "inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

function Banner({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  const classes =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return (
    <div className={`rounded-md border px-3 py-2 text-sm font-medium ${classes}`}>{children}</div>
  );
}

function Countdown({ until }: { until: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000));
  if (seconds <= 0) return <>now</>;
  return <>{retryMessage(seconds)}</>;
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        className={inputClass}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
      />
    </label>
  );
}

function AuthView({ onSignedIn }: { onSignedIn: () => void }) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [blockUntil, setBlockUntil] = useState<number | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (tab === "login") {
        const { token } = await api.login(username.trim(), password);
        setToken(token);
        onSignedIn();
        return;
      }
      await api.register(username.trim(), password);
      setInfo("Account created. You can sign in now.");
      setTab("login");
    } catch (err) {
      const apiErr: ApiError | null = isApiError(err) ? err : null;
      if (apiErr?.status === 429) {
        const seconds = apiErr.retryAfter ?? 60;
        setBlockUntil(Date.now() + seconds * 1000);
        setError(
          apiErr.error === "account_locked"
            ? `“${username.trim()}” is locked after too many failed sign-ins.`
            : "Too many sign-in attempts from this device.",
        );
      } else {
        setError(apiErr?.message ?? "Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  };

  const tabButton = (id: "login" | "register", label: string) => (
    <button
      type="button"
      onClick={() => {
        setTab(id);
        setError(null);
        setInfo(null);
        setBlockUntil(null);
      }}
      className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
        tab === id ? "bg-white text-indigo-700 shadow" : "text-slate-600 hover:text-slate-900"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1">
        {tabButton("login", "Sign in")}
        {tabButton("register", "Register")}
      </div>
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Username" type="text" value={username} onChange={setUsername} autoComplete="username" />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete={tab === "login" ? "current-password" : "new-password"}
        />
        {error && (
          <div className="space-y-1">
            <Banner tone="error">{error}</Banner>
            {blockUntil !== null && (
              <Banner tone="error">
                <Countdown until={blockUntil} />
              </Banner>
            )}
          </div>
        )}
        {info && <Banner tone="info">{info}</Banner>}
        <button className={`${buttonClass} w-full`} disabled={busy}>
          {tab === "login" ? "Sign in" : "Create account"}
        </button>
        <p className="text-xs text-slate-500">
          A username locks for 15 minutes after 5 failed sign-ins, and each device is limited to 20
          sign-in attempts per minute.
        </p>
      </form>
    </div>
  );
}

function LocksView({ username }: { username: string }) {
  const [locks, setLocks] = useState<Lock[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLocks((await api.locks()).items);
    } catch (err) {
      if (isApiError(err) && err.status === 403) {
        setForbidden(true);
        return;
      }
      setError(isApiError(err) ? err.message : "Could not load locks.");
      setLocks([]);
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 5000);
    return () => window.clearInterval(id);
  }, [load]);

  if (forbidden) return null;

  const unlock = async (name: string) => {
    setNotice(null);
    try {
      await api.unlock(name);
      setNotice(`“${name}” unlocked.`);
      await load();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not unlock.");
    }
  };

  const isAdminSelf = username === "admin";

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Locked usernames</h2>
        <button className={secondaryButtonClass} onClick={load}>
          Refresh
        </button>
      </div>
      {isAdminSelf && (
        <Banner tone="info">
          You are signed in as “{username}”, so sign-ins for this username are not locked.
        </Banner>
      )}
      {error && <Banner tone="error">{error}</Banner>}
      {notice && <Banner tone="info">{notice}</Banner>}
      {locks === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : locks.length === 0 ? (
        <p className="text-sm text-slate-500">No usernames are locked right now.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {locks.map((lock) => (
            <li key={lock.username} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{lock.username}</p>
                <p className="text-xs text-slate-500">
                  Locked until {formatInstant(lock.locked_until)}
                </p>
              </div>
              <button className={buttonClass} onClick={() => unlock(lock.username)}>
                Unlock
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AccountView({ me, onSignedOut }: { me: Me; onSignedOut: () => void }) {
  const [attempts, setAttempts] = useState<LoginAttempt[] | null>(null);

  useEffect(() => {
    api
      .loginAttempts()
      .then((data) => setAttempts(data.items))
      .catch(() => setAttempts([]));
  }, [me.id]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Account</p>
            <h1 className="text-xl font-semibold text-slate-900">{me.username}</h1>
            <p className="mt-1 text-sm text-slate-600">
              Last sign-in: <span className="font-medium">{formatInstant(me.last_login_at)}</span>
            </p>
          </div>
          <button className={secondaryButtonClass} onClick={onSignedOut}>
            Sign out
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Recent sign-in attempts</h2>
        {attempts === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : attempts.length === 0 ? (
          <p className="text-sm text-slate-500">No sign-in attempts yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {attempts.map((attempt, index) => (
              <li key={`${attempt.at}-${index}`} className="flex items-center gap-3 py-2.5">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    attempt.success
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {attempt.success ? "Success" : "Failed"}
                </span>
                <span className="text-sm text-slate-700">{formatInstant(attempt.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <LocksView username={me.username} />
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setChecking(false);
      return;
    }
    try {
      setMe(await api.me());
    } catch (err) {
      if (isApiError(err) && err.status === 401) setToken(null);
      setMe(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signOut = () => {
    setToken(null);
    setMe(null);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <span className="text-lg font-semibold tracking-tight">Acme Accounts</span>
          {me && (
            <span className="text-sm text-slate-600">
              Signed in as <span className="font-semibold text-slate-900">{me.username}</span>
            </span>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        {checking ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : me ? (
          <AccountView me={me} onSignedOut={signOut} />
        ) : (
          <AuthView onSignedIn={refresh} />
        )}
      </main>
    </div>
  );
}
