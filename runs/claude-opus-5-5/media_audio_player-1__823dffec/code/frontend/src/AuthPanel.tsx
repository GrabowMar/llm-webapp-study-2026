import { useState, type FormEvent } from "react";
import { ApiError, api } from "./api";

interface Props {
  onSignedIn: (token: string, username: string) => void;
}

const inputClass =
  "w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400";

export default function AuthPanel({ onSignedIn }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setError(null);
    setFieldErrors({});
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      if (mode === "register") {
        await api.register(username, password);
      }
      const res = await api.login(username, password);
      onSignedIn(res.token, res.user?.username ?? username.trim());
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors);
      } else {
        setError("Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  };

  const tabClass = (active: boolean) =>
    `flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
      active ? "bg-indigo-500 text-white" : "text-slate-300 hover:bg-slate-700"
    }`;

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-5">
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-900 p-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={tabClass(mode === "login")}
          onClick={() => switchMode("login")}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          className={tabClass(mode === "register")}
          onClick={() => switchMode("register")}
        >
          Register
        </button>
      </div>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <h2 className="text-lg font-semibold text-slate-100">
          {mode === "login" ? "Sign in" : "Create an account"}
        </h2>
        <div>
          <label htmlFor="auth-username" className="mb-1 block text-xs font-medium text-slate-400">
            Username
          </label>
          <input
            id="auth-username"
            name="username"
            className={inputClass}
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          {fieldErrors.username && <p className="mt-1 text-xs text-rose-400">{fieldErrors.username}</p>}
        </div>
        <div>
          <label htmlFor="auth-password" className="mb-1 block text-xs font-medium text-slate-400">
            Password
          </label>
          <input
            id="auth-password"
            name="password"
            type="password"
            className={inputClass}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {fieldErrors.password && <p className="mt-1 text-xs text-rose-400">{fieldErrors.password}</p>}
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}
        </button>
      </form>
    </section>
  );
}
