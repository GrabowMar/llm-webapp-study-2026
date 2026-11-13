import { useState } from "react";
import type { FormEvent } from "react";
import { login, register, storeAuth } from "../api";

export default function AuthPanel({ onSignedIn }: { onSignedIn: (username: string) => void }) {
  const [regUser, setRegUser] = useState("");
  const [regPass, setRegPass] = useState("");
  const [logUser, setLogUser] = useState("");
  const [logPass, setLogPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register(regUser, regPass);
      const { token } = await login(regUser, regPass);
      storeAuth(token, regUser);
      onSignedIn(regUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { token } = await login(logUser, logPass);
      storeAuth(token, logUser);
      onSignedIn(logUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
  const button =
    "rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50";

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form onSubmit={handleRegister} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Create an account</h2>
        <label className="mb-2 block text-sm font-medium text-slate-600">
          Username
          <input
            className={`${input} mt-1`}
            value={regUser}
            onChange={(e) => setRegUser(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="mb-4 block text-sm font-medium text-slate-600">
          Password
          <input
            type="password"
            className={`${input} mt-1`}
            value={regPass}
            onChange={(e) => setRegPass(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <button type="submit" className={button} disabled={busy}>
          Register
        </button>
      </form>

      <form onSubmit={handleLogin} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Sign in</h2>
        <label className="mb-2 block text-sm font-medium text-slate-600">
          Username
          <input
            className={`${input} mt-1`}
            value={logUser}
            onChange={(e) => setLogUser(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="mb-4 block text-sm font-medium text-slate-600">
          Password
          <input
            type="password"
            className={`${input} mt-1`}
            value={logPass}
            onChange={(e) => setLogPass(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit" className={button} disabled={busy}>
          Sign in
        </button>
      </form>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 md:col-span-2">
          {error}
        </p>
      ) : null}
    </div>
  );
}
