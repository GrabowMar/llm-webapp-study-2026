import { useState, type FormEvent } from "react";
import { api, ApiError, saveSession } from "../api";

interface Props {
  onSignedIn: (token: string, username: string) => void;
}

const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40";
const buttonClass =
  "w-full rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50";

export default function AuthPanel({ onSignedIn }: Props) {
  const [regUser, setRegUser] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regError, setRegError] = useState<string | null>(null);
  const [regDone, setRegDone] = useState<string | null>(null);
  const [regBusy, setRegBusy] = useState(false);

  const [logUser, setLogUser] = useState("");
  const [logPass, setLogPass] = useState("");
  const [logError, setLogError] = useState<string | null>(null);
  const [logBusy, setLogBusy] = useState(false);

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    setRegError(null);
    setRegDone(null);
    setRegBusy(true);
    try {
      await api.register(regUser.trim(), regPass);
      setRegDone("Account created. You can sign in now.");
      setRegPass("");
    } catch (err) {
      setRegError(err instanceof ApiError ? err.message : "Registration failed.");
    } finally {
      setRegBusy(false);
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLogError(null);
    setLogBusy(true);
    try {
      const result = await api.login(logUser.trim(), logPass);
      saveSession(result.token, logUser.trim());
      onSignedIn(result.token, logUser.trim());
    } catch (err) {
      setLogError(err instanceof ApiError ? err.message : "Sign in failed.");
    } finally {
      setLogBusy(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-100">Create account</h2>
        <form onSubmit={handleRegister} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="reg-username">
              Username
            </label>
            <input
              id="reg-username"
              className={inputClass}
              value={regUser}
              onChange={(e) => setRegUser(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="reg-password">
              Password
            </label>
            <input
              id="reg-password"
              type="password"
              className={inputClass}
              value={regPass}
              onChange={(e) => setRegPass(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          {regError && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {regError}
            </p>
          )}
          {regDone && (
            <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              {regDone}
            </p>
          )}
          <button type="submit" className={buttonClass} disabled={regBusy}>
            {regBusy ? "Creating…" : "Register"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-100">Sign in</h2>
        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="log-username">
              Username
            </label>
            <input
              id="log-username"
              className={inputClass}
              value={logUser}
              onChange={(e) => setLogUser(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="log-password">
              Password
            </label>
            <input
              id="log-password"
              type="password"
              className={inputClass}
              value={logPass}
              onChange={(e) => setLogPass(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {logError && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {logError}
            </p>
          )}
          <button type="submit" className={buttonClass} disabled={logBusy}>
            {logBusy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </div>
  );
}
