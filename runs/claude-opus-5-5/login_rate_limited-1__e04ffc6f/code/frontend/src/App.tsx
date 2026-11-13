import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ApiError,
  api,
  formatDateTime,
  formatDuration,
  getToken,
  setToken,
  type LoginAttempt,
  type Lock,
  type Me,
} from "./api";

type View = "login" | "register" | "account" | "admin";

function viewFromHash(): View {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h === "register" || h === "account" || h === "admin" || h === "login") return h;
  return "login";
}

function navigate(view: View) {
  window.location.hash = `/${view}`;
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";
const primaryButton =
  "inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function Alert({ kind, children }: { kind: "error" | "warning" | "success"; children: ReactNode }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  }[kind];
  return (
    <div role="alert" className={`rounded-md border px-3 py-2 text-sm ${styles}`}>
      {children}
    </div>
  );
}

type Blocked = { code: string | undefined; message: string; until: number };

function LoginForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useNow();

  const remaining = blocked ? (blocked.until - now) / 1000 : 0;
  const isBlocked = blocked !== null && remaining > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { token } = await api.login(username, password);
      setToken(token);
      setBlocked(null);
      setPassword("");
      onLoggedIn();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const seconds = err.retryAfter ?? 60;
        const reason =
          err.code === "account_locked"
            ? "This username is temporarily locked after too many failed sign-in attempts."
            : "Too many sign-in attempts from this device. Please slow down.";
        setBlocked({ code: err.code, message: reason, until: Date.now() + seconds * 1000 });
      } else if (err instanceof ApiError) {
        setBlocked(null);
        setError(err.message);
      } else {
        setError("Could not reach the server.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Sign in">
      <form onSubmit={submit} className="space-y-4">
        {isBlocked && blocked && (
          <Alert kind="warning">
            <p className="font-medium">
              {blocked.code === "account_locked" ? "Account locked" : "Too many attempts"}
            </p>
            <p>{blocked.message}</p>
            <p className="mt-1">
              Try again at{" "}
              <span className="font-semibold">{new Date(blocked.until).toLocaleTimeString()}</span>{" "}
              (in <span className="font-semibold tabular-nums">{formatDuration(remaining)}</span>).
            </p>
          </Alert>
        )}
        {error && <Alert kind="error">{error}</Alert>}
        <label className="block text-sm font-medium text-slate-700">
          Username
          <input
            className={inputClass}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              if (blocked?.code === "account_locked") setBlocked(null);
            }}
            autoComplete="username"
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            className={inputClass}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit" className={primaryButton} disabled={busy || isBlocked}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-center text-sm text-slate-600">
          No account?{" "}
          <a href="#/register" className="font-medium text-indigo-600 hover:underline">
            Register
          </a>
        </p>
      </form>
    </Card>
  );
}

function RegisterForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.register(username, password);
      setDone(res.username);
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Create an account">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        {done && (
          <Alert kind="success">
            Account <span className="font-semibold">{done}</span> created.{" "}
            <a href="#/login" className="font-medium underline">
              Sign in
            </a>
            .
          </Alert>
        )}
        <label className="block text-sm font-medium text-slate-700">
          Username
          <input
            className={inputClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            minLength={3}
            maxLength={64}
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            className={inputClass}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">At least 8 characters.</span>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Confirm password
          <input
            className={inputClass}
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <button type="submit" className={primaryButton} disabled={busy}>
          {busy ? "Creating…" : "Register"}
        </button>
        <p className="text-center text-sm text-slate-600">
          Already registered?{" "}
          <a href="#/login" className="font-medium text-indigo-600 hover:underline">
            Sign in
          </a>
        </p>
      </form>
    </Card>
  );
}

function AccountPage({ me, onUnauthorized }: { me: Me; onUnauthorized: () => void }) {
  const [items, setItems] = useState<LoginAttempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.attempts();
      setItems(res.items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      else setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <Card title="Account">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Username</dt>
            <dd className="mt-1 font-medium text-slate-900">{me.username}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Account ID</dt>
            <dd className="mt-1 font-medium text-slate-900">{me.id}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Last sign-in</dt>
            <dd className="mt-1 font-medium text-slate-900">{formatDateTime(me.last_login_at)}</dd>
          </div>
        </dl>
      </Card>
      <Card title="Recent sign-in attempts">
        <div className="mb-3 flex justify-end">
          <button className={secondaryButton} onClick={() => void load()}>
            Refresh
          </button>
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        {items === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
        {items !== null && items.length === 0 && (
          <p className="text-sm text-slate-500">No sign-in attempts yet.</p>
        )}
        {items !== null && items.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4 font-medium">Time</th>
                <th className="py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a, i) => (
                <tr key={`${a.at}-${i}`} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-700 tabular-nums">{formatDateTime(a.at)}</td>
                  <td className="py-2">
                    {a.success ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        Success
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        {a.reason === "locked" ? "Failed (locked)" : "Failed"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function AdminPage({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [items, setItems] = useState<Lock[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const now = useNow();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.locks();
      setItems(res.items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      else setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(id);
  }, [load]);

  async function unlock(username: string) {
    setPending(username);
    setNotice(null);
    setError(null);
    try {
      await api.unlock(username);
      setNotice(`Unlocked ${username}.`);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      else setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    } finally {
      setPending(null);
    }
  }

  const visible = (items ?? []).filter((l) => new Date(l.locked_until).getTime() > now);

  return (
    <Card title="Locked usernames">
      <div className="mb-3 flex justify-end">
        <button className={secondaryButton} onClick={() => void load()}>
          Refresh
        </button>
      </div>
      <div className="space-y-3">
        {error && <Alert kind="error">{error}</Alert>}
        {notice && <Alert kind="success">{notice}</Alert>}
        {items === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
        {items !== null && visible.length === 0 && (
          <p className="text-sm text-slate-500">No usernames are currently locked.</p>
        )}
        {visible.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4 font-medium">Username</th>
                <th className="py-2 pr-4 font-medium">Locked until</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => (
                <tr key={l.username} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 font-medium text-slate-900">{l.username}</td>
                  <td className="py-2 pr-4 text-slate-700 tabular-nums">
                    {formatDateTime(l.locked_until)}{" "}
                    <span className="text-slate-500">
                      ({formatDuration((new Date(l.locked_until).getTime() - now) / 1000)} left)
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      className={secondaryButton}
                      onClick={() => void unlock(l.username)}
                      disabled={pending === l.username}
                    >
                      {pending === l.username ? "Unlocking…" : "Unlock"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

export default function App() {
  const [view, setView] = useState<View>(viewFromHash);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(() => getToken() !== null);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const signOutLocal = useCallback(() => {
    setToken(null);
    setMe(null);
    navigate("login");
  }, []);

  const loadMe = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      setMe(await api.me());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setToken(null);
        setMe(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const isAdmin = me?.is_admin === true || me?.username === "admin";

  useEffect(() => {
    if (loading) return;
    if (me && (view === "login" || view === "register")) navigate("account");
    else if (!me && (view === "account" || view === "admin")) navigate("login");
    else if (me && view === "admin" && !isAdmin) navigate("account");
  }, [me, view, loading, isAdmin]);

  async function signOut() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    signOutLocal();
  }

  const navLink = (target: View, label: string) => (
    <a
      href={`#/${target}`}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
        view === target ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </a>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-4">
            <span className="text-base font-bold text-indigo-700">Accounts</span>
            {me && (
              <nav className="flex gap-1">
                {navLink("account", "Account")}
                {isAdmin && navLink("admin", "Admin")}
              </nav>
            )}
          </div>
          {me ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as <span className="font-semibold text-slate-900">{me.username}</span>
              </span>
              <button className={secondaryButton} onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          ) : (
            <nav className="flex gap-1">
              {navLink("login", "Sign in")}
              {navLink("register", "Register")}
            </nav>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : me ? (
          view === "admin" && isAdmin ? (
            <AdminPage onUnauthorized={signOutLocal} />
          ) : (
            <AccountPage key={me.last_login_at ?? ""} me={me} onUnauthorized={signOutLocal} />
          )
        ) : (
          <div className="mx-auto max-w-sm">
            {view === "register" ? (
              <RegisterForm />
            ) : (
              <LoginForm
                onLoggedIn={() => {
                  setLoading(true);
                  void loadMe();
                }}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
