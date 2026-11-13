import { useState } from "react";
import type { FormEvent } from "react";
import { login, register, storeSession } from "../api";

interface Props {
  onSignedIn: (token: string, username: string) => void;
}

export default function AuthPage({ onSignedIn }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        await register(username, password);
      }
      const { token } = await login(username, password);
      storeSession(token, username);
      onSignedIn(token, username);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const tabClass = (tab: "login" | "register") =>
    `flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
      mode === tab
        ? "bg-white text-indigo-600 shadow-sm"
        : "text-slate-500 hover:text-slate-700"
    }`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-3xl font-bold tracking-tight text-slate-900">
          Markdown Notes
        </h1>
        <div className="rounded-2xl bg-slate-200/70 p-1">
          <div className="flex gap-1">
            <button type="button" className={tabClass("login")} onClick={() => setMode("login")}>
              Sign in
            </button>
            <button
              type="button"
              className={tabClass("register")}
              onClick={() => setMode("register")}
            >
              Create account
            </button>
          </div>
        </div>
        <form
          onSubmit={submit}
          className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoFocus
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
