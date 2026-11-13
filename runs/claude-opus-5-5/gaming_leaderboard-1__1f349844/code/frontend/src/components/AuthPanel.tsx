import { useState, type FormEvent } from "react";
import { api, ApiError, type User } from "../api";

interface Props {
  onSignedIn: (token: string, user: User) => void;
}

export default function AuthPanel({ onSignedIn }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register(username, password);
      }
      const res = await api.login(username, password);
      onSignedIn(res.token, res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const tabClass = (active: boolean) =>
    `flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
      active ? "bg-white text-slate-900 shadow" : "text-slate-300 hover:text-white"
    }`;

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-5 shadow-lg">
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-900 p-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={tabClass(mode === "login")}
          onClick={() => {
            setMode("login");
            setError(null);
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          className={tabClass(mode === "register")}
          onClick={() => {
            setMode("register");
            setError(null);
          }}
        >
          Register
        </button>
      </div>
      <form onSubmit={submit} className="space-y-3" aria-label={mode === "login" ? "Sign in" : "Register"}>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Username
          </span>
          <input
            name="username"
            autoComplete="username"
            required
            minLength={mode === "register" ? 3 : 1}
            maxLength={64}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/40"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Password
          </span>
          <input
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "register" ? 6 : 1}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/40"
          />
        </label>
        {error && (
          <p role="alert" className="rounded-md bg-rose-500/15 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-indigo-500 px-4 py-2 font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
        >
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
    </section>
  );
}
