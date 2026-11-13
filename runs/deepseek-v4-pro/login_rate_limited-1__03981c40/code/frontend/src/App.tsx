import { useEffect, useState } from "react";

type Me = { id: number; username: string; last_login_at: string | null };

type Attempt = { at: string; success: boolean };

type Lock = { username: string; locked_until: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as any) };
  const token = localStorage.getItem("token");
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401 && path !== "/api/auth/login" && path !== "/api/auth/register") {
    localStorage.removeItem("token");
    window.dispatchEvent(new Event("auth-change"));
    throw new Error("unauthorized");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(body.error || "request_failed");
    err.status = res.status;
    err.retryAfter = res.headers.get("Retry-After");
    err.body = body;
    throw err;
  }
  return body as T;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "never";
  return d.toLocaleString();
}

function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="mt-2 rounded bg-red-100 px-3 py-2 text-sm text-red-700">{message}</p>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-sm font-medium text-gray-700">{children}</label>
  );
}

const inputCls =
  "w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

function FormShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">{title}</h1>
      {children}
    </div>
  );
}

function Register({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      onDone();
    } catch (err: any) {
      setError(err.message === "username_taken" ? "Username is already taken." : err.message);
    }
  }

  return (
    <FormShell title="Create account">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label>Username</Label>
          <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div>
          <Label>Password</Label>
          <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="w-full rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Register
        </button>
      </form>
      <ErrorBox message={error} />
    </FormShell>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [retryAt, setRetryAt] = useState<number | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setRetryAt(null);
    try {
      const data = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      localStorage.setItem("token", data.token);
      window.dispatchEvent(new Event("auth-change"));
      onDone();
    } catch (err: any) {
      if (err.status === 429 && err.retryAfter) {
        const secs = parseInt(err.retryAfter, 10) || 0;
        const target = Date.now() + secs * 1000;
        setRetryAt(target);
        setError(`Too many attempts. Try again at ${new Date(target).toLocaleTimeString()}.`);
      } else if (err.message === "invalid_credentials") {
        setError("Invalid username or password.");
      } else {
        setError(err.message);
      }
    }
  }

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (retryAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [retryAt]);

  return (
    <FormShell title="Sign in">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label>Username</Label>
          <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div>
          <Label>Password</Label>
          <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="w-full rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Sign in
        </button>
      </form>
      {retryAt != null && now >= retryAt && (
        <p className="mt-2 text-sm text-gray-500">You can try again now.</p>
      )}
      <ErrorBox message={error} />
    </FormShell>
  );
}

function Account({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);

  useEffect(() => {
    api<{ items: Attempt[] }>("/api/me/login-attempts")
      .then((d) => setAttempts(d.items))
      .catch(() => setAttempts([]));
  }, []);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Account</h1>
        <button
          onClick={onLogout}
          className="rounded bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300"
        >
          Sign out
        </button>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-600">
          Signed in as <span className="font-medium text-gray-900">{me.username}</span>
        </p>
        <p className="mt-1 text-sm text-gray-600">
          Last sign-in: <span className="font-medium text-gray-900">{formatTime(me.last_login_at)}</span>
        </p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Recent sign-in attempts</h2>
        {attempts === null ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : attempts.length === 0 ? (
          <p className="text-sm text-gray-500">No sign-in attempts yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {attempts.map((a, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-600">{formatTime(a.at)}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    a.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}
                >
                  {a.success ? "success" : "failed"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Admin({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [locks, setLocks] = useState<Lock[]>([]);

  async function refresh() {
    try {
      const d = await api<{ items: Lock[] }>("/api/admin/locks");
      setLocks(d.items);
    } catch {
      setLocks([]);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function unlock(username: string) {
    await api(`/api/admin/locks/${encodeURIComponent(username)}/unlock`, { method: "POST" });
    refresh();
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Admin: locked usernames</h1>
        <button
          onClick={onLogout}
          className="rounded bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300"
        >
          Sign out
        </button>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        {locks.length === 0 ? (
          <p className="text-sm text-gray-500">No usernames are locked.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {locks.map((l) => (
              <li key={l.username} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{l.username}</p>
                  <p className="text-xs text-gray-500">until {formatTime(l.locked_until)}</p>
                </div>
                <button
                  onClick={() => unlock(l.username)}
                  className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  Unlock
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [view, setView] = useState<"login" | "register">("login");

  useEffect(() => {
    function load() {
      if (!localStorage.getItem("token")) {
        setMe(null);
        return;
      }
      api<Me>("/api/me")
        .then(setMe)
        .catch(() => setMe(null));
    }
    load();
    window.addEventListener("auth-change", load);
    return () => window.removeEventListener("auth-change", load);
  }, []);

  function logout() {
    localStorage.removeItem("token");
    setMe(null);
  }

  if (me === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">Loading…</div>
    );
  }

  if (me) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <span className="text-sm font-semibold text-gray-900">
              Signed in as {me.username}
            </span>
            <button
              onClick={logout}
              className="rounded bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="px-4 py-8">
          {me.username === "admin" ? (
            <Admin me={me} onLogout={logout} />
          ) : (
            <Account me={me} onLogout={logout} />
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex rounded-lg bg-gray-200 p-1">
          <button
            onClick={() => setView("login")}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium ${
              view === "login" ? "bg-white text-gray-900 shadow" : "text-gray-600"
            }`}
          >
            Sign in
          </button>
          <button
            onClick={() => setView("register")}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium ${
              view === "register" ? "bg-white text-gray-900 shadow" : "text-gray-600"
            }`}
          >
            Register
          </button>
        </div>
        {view === "login" ? (
          <Login onDone={() => setMe(undefined)} />
        ) : (
          <Register onDone={() => setView("login")} />
        )}
      </div>
    </div>
  );
}
