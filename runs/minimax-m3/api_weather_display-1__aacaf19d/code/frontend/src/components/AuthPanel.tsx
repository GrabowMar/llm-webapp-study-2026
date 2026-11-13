import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError, login, register, setToken } from "../api";

interface AuthPanelProps {
  onSignedIn: (username: string) => void;
}

type Mode = "login" | "register";

export default function AuthPanel({ onSignedIn }: AuthPanelProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setErrors({});
    setMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      if (mode === "register") {
        const created = await register(username.trim(), password);
        const session = await login(username.trim(), password);
        setToken(session.token);
        onSignedIn(session.username ?? created.username);
      } else {
        const session = await login(username.trim(), password);
        setToken(session.token);
        onSignedIn(session.username);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.errors);
        setMessage(error.message);
      } else {
        setMessage("Could not reach the server. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const isRegister = mode === "register";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Your account</h2>
      <p className="mt-1 text-sm text-slate-500">
        Sign in to add, edit and remove weather reports. Anyone can look up a city.
      </p>

      <div className="mt-4 inline-flex rounded-lg bg-slate-100 p-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={!isRegister}
          onClick={() => switchMode("login")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            !isRegister ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isRegister}
          onClick={() => switchMode("register")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            isRegister ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
          }`}
        >
          Register
        </button>
      </div>

      <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="auth-username">
            Username
          </label>
          <input
            id="auth-username"
            name="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
          {errors.username && (
            <p className="mt-1 text-sm text-rose-600">{errors.username}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            name="password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
          {errors.password && (
            <p className="mt-1 text-sm text-rose-600">{errors.password}</p>
          )}
        </div>

        {message && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
        </button>
      </form>
    </section>
  );
}
