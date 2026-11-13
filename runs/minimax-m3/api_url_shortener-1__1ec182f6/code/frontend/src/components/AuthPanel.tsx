import { useState } from "react";
import { api, errorMessage } from "../api";
import type { User } from "../types";

type AuthPanelProps = {
  onSignedIn: (user: User, token: string) => void;
};

export default function AuthPanel({ onSignedIn }: AuthPanelProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (isRegister) {
        await api.register(username.trim(), password);
        setNotice("Account created. Signing you in...");
      }
      const session = await api.login(username.trim(), password);
      const user = session.user ?? (await api.me());
      onSignedIn(user, session.token);
    } catch (err) {
      setError(errorMessage(err, "We could not sign you in."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/50">
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-slate-800/70 p-1">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError(null);
            setNotice(null);
          }}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            !isRegister ? "bg-indigo-500 text-white shadow" : "text-slate-300 hover:text-white"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("register");
            setError(null);
            setNotice(null);
          }}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            isRegister ? "bg-indigo-500 text-white shadow" : "text-slate-300 hover:text-white"
          }`}
        >
          Create account
        </button>
      </div>

      <h2 className="text-xl font-semibold text-white">
        {isRegister ? "Create your account" : "Welcome back"}
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        {isRegister
          ? "Pick a username and password to start shortening links."
          : "Sign in to shorten links and manage your recent links."}
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-300">Username</span>
          <input
            type="text"
            value={username}
            autoComplete="username"
            required
            onChange={(event) => setUsername(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
            placeholder="ada"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-300">Password</span>
          <input
            type="password"
            value={password}
            autoComplete={isRegister ? "new-password" : "current-password"}
            required
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
            placeholder="••••••••"
          />
        </label>

        {error ? (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            {notice}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Please wait..." : isRegister ? "Create account" : "Sign in"}
        </button>
      </form>
    </section>
  );
}
