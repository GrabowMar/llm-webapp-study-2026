import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api, setToken } from "./api";

type Refusal = { message: string; retryAt: string; retryAfter: number };

function formatWhen(iso: string) {
  return new Date(iso).toLocaleTimeString();
}

function Refused({ refusal }: { refusal: Refusal }) {
  const [left, setLeft] = useState(refusal.retryAfter);
  useEffect(() => {
    const end = new Date(refusal.retryAt).getTime();
    const tick = () => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [refusal]);
  const mins = Math.floor(left / 60);
  const secs = left % 60;
  return (
    <div
      role="alert"
      data-testid="lockout-message"
      className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <p className="font-semibold">{refusal.message}</p>
      <p>
        Try again at {formatWhen(refusal.retryAt)}
        {left > 0 ? ` (in ${mins}m ${String(secs).padStart(2, "0")}s)` : " (now)"}.
      </p>
    </div>
  );
}

const input = "w-full rounded border border-slate-300 px-2 py-1";
const button =
  "rounded bg-indigo-600 px-4 py-1.5 text-white hover:bg-indigo-700 disabled:opacity-50";

export default function AuthForms({ onSignedIn }: { onSignedIn: () => void }) {
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [busy, setBusy] = useState(false);

  const [regUser, setRegUser] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regError, setRegError] = useState<string | null>(null);
  const [regOk, setRegOk] = useState(false);

  const login = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setRefusal(null);
    setBusy(true);
    try {
      const { token } = await api<{ token: string }>("/auth/login", {
        method: "POST",
        body: { username: loginUser, password: loginPass },
      });
      setToken(token);
      setLoginPass("");
      onSignedIn();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429 && err.retryAt) {
        const locked = err.code === "account_locked";
        setRefusal({
          message: locked
            ? "This username is locked after too many failed sign-ins."
            : "Too many sign-in attempts from this client.",
          retryAt: err.retryAt,
          retryAfter: err.retryAfter ?? 0,
        });
      } else {
        setLoginError(err instanceof Error ? err.message : "Sign-in failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const register = async (e: FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegOk(false);
    try {
      await api("/auth/register", {
        method: "POST",
        body: { username: regUser, password: regPass },
      });
      setRegOk(true);
      setRegPass("");
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "Registration failed");
    }
  };

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <form onSubmit={login} className="space-y-3 rounded bg-white p-4 shadow" aria-label="Sign in">
        <h2 className="text-lg font-semibold">Sign in</h2>
        <label className="block text-sm">
          Username
          <input
            className={input}
            name="username"
            autoComplete="username"
            value={loginUser}
            onChange={(e) => setLoginUser(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            className={input}
            type="password"
            name="password"
            autoComplete="current-password"
            value={loginPass}
            onChange={(e) => setLoginPass(e.target.value)}
            required
          />
        </label>
        {refusal && <Refused refusal={refusal} />}
        {loginError && (
          <p role="alert" className="text-sm text-red-600">
            {loginError}
          </p>
        )}
        <button className={button} disabled={busy}>
          Sign in
        </button>
      </form>

      <form onSubmit={register} className="space-y-3 rounded bg-white p-4 shadow" aria-label="Register">
        <h2 className="text-lg font-semibold">Register</h2>
        <label className="block text-sm">
          Username
          <input
            className={input}
            name="username"
            autoComplete="off"
            value={regUser}
            onChange={(e) => setRegUser(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            className={input}
            type="password"
            name="password"
            autoComplete="new-password"
            value={regPass}
            onChange={(e) => setRegPass(e.target.value)}
            required
          />
        </label>
        {regError && (
          <p role="alert" className="text-sm text-red-600">
            {regError}
          </p>
        )}
        {regOk && <p className="text-sm text-green-700">Account created. You can sign in now.</p>}
        <button className={button}>Register</button>
      </form>
    </div>
  );
}
