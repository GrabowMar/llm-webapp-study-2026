import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ApiError,
  LoginAttempt,
  Lock,
  User,
  fetchLocks,
  fetchLoginAttempts,
  fetchMe,
  getToken,
  login,
  register,
  setToken,
  unlock,
} from "./api";

function formatTime(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function retryAfterText(seconds: number): string {
  const when = new Date(Date.now() + seconds * 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const parts: string[] = [];
  if (mins > 0) parts.push(`${mins} minute${mins === 1 ? "" : "s"}`);
  if (secs > 0 || mins === 0) parts.push(`${secs} second${secs === 1 ? "" : "s"}`);
  return `Try again after ${when.toLocaleTimeString()} (in ${parts.join(" ")})`;
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
      {children}
    </div>
  );
}

function InfoBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
      {children}
    </div>
  );
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
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </label>
  );
}

function AuthScreen({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNote, setRetryNote] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setRetryNote(null);
    setInfo(null);
    try {
      if (mode === "login") {
        const { token } = await login(username, password);
        setToken(token);
        const user = await fetchMe();
        onSignedIn(user);
      } else {
        await register(username, password);
        setInfo("Account created. You can sign in now.");
        setMode("login");
        setPassword("");
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Something went wrong.";
      setError(msg);
      if (err instanceof ApiError && err.status === 429 && err.retryAfter !== null) {
        setRetryNote(retryAfterText(err.retryAfter));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
      <div className="mb-6 flex rounded-lg bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError(null);
            setRetryNote(null);
            setInfo(null);
          }}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium ${
            mode === "login" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("register");
            setError(null);
            setRetryNote(null);
            setInfo(null);
          }}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium ${
            mode === "register" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"
          }`}
        >
          Register
        </button>
      </div>

      <h2 className="mb-4 text-xl font-semibold text-gray-900">
        {mode === "login" ? "Sign in to your account" : "Create an account"}
      </h2>

      {info && <div className="mb-4"><InfoBanner>{info}</InfoBanner></div>}
      {error && (
        <div className="mb-4">
          <ErrorBanner>
            <p>{error}</p>
            {retryNote && <p className="mt-1 font-medium">{retryNote}</p>}
          </ErrorBanner>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Username"
          type="text"
          value={username}
          onChange={setUsername}
          autoComplete="username"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Working…" : mode === "login" ? "Sign in" : "Register"}
        </button>
      </form>
    </div>
  );
}

function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [attempts, setAttempts] = useState<LoginAttempt[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [me, res] = await Promise.all([fetchMe(), fetchLoginAttempts()]);
      setUser(me);
      setAttempts(res.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load account data.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Account</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Username</dt>
            <dd className="font-medium text-gray-900">{user?.username ?? "…"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Last sign-in</dt>
            <dd className="font-medium text-gray-900">{formatTime(user?.last_login_at ?? null)}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent sign-in attempts</h2>
        {attempts.length === 0 ? (
          <p className="text-sm text-gray-500">No sign-in attempts yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 font-medium">When</th>
                <th className="py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 text-gray-900">{formatTime(a.at)}</td>
                  <td className="py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        a.success
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {a.success ? "Success" : "Failed"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AdminPage() {
  const [locks, setLocks] = useState<Lock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchLocks();
      setLocks(res.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load locks.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const doUnlock = async (username: string) => {
    setInfo(null);
    try {
      await unlock(username);
      setInfo(`Unlocked "${username}".`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to unlock.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {info && <InfoBanner>{info}</InfoBanner>}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Locked usernames</h2>
        {locks.length === 0 ? (
          <p className="text-sm text-gray-500">No usernames are currently locked.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 font-medium">Username</th>
                <th className="py-2 font-medium">Locked until</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {locks.map((l) => (
                <tr key={l.username} className="border-b border-gray-100">
                  <td className="py-2 font-medium text-gray-900">{l.username}</td>
                  <td className="py-2 text-gray-700">{formatTime(l.locked_until)}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void doUnlock(l.username)}
                      className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                    >
                      Unlock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<"account" | "admin">("account");
  const [loading, setLoading] = useState(getToken() !== null);

  useEffect(() => {
    if (getToken() === null) {
      setLoading(false);
      return;
    }
    fetchMe()
      .then((me) => {
        setUser(me);
        setView("account");
      })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const signOut = () => {
    setToken(null);
    setUser(null);
    setView("account");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <h1 className="text-lg font-bold text-gray-900">Account Service</h1>
          {user && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-700">
                Signed in as <span className="font-semibold">{user.username}</span>
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {loading ? (
          <p className="text-center text-gray-500">Loading…</p>
        ) : !user ? (
          <AuthScreen onSignedIn={setUser} />
        ) : (
          <>
            <nav className="mb-6 flex gap-2">
              <button
                type="button"
                onClick={() => setView("account")}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  view === "account"
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-gray-700 border border-gray-300"
                }`}
              >
                Account
              </button>
              {user.username === "admin" && (
                <button
                  type="button"
                  onClick={() => setView("admin")}
                  className={`rounded-md px-4 py-2 text-sm font-medium ${
                    view === "admin"
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-gray-700 border border-gray-300"
                  }`}
                >
                  Admin
                </button>
              )}
            </nav>
            {view === "account" ? <AccountPage /> : <AdminPage />}
          </>
        )}
      </main>
    </div>
  );
}
