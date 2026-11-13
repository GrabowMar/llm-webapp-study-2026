import { FormEvent, useState } from "react";
import { api, setSession } from "../api";

type Mode = "login" | "register";

export default function AuthForm({ onAuthed }: { onAuthed: (username: string) => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const name = username.trim();
    if (!name || !password) {
      setError("Enter a username and a password.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") {
        await api("/api/auth/register", {
          method: "POST",
          body: { username: name, password },
          auth: false,
        });
      }
      const session = await api<{ token: string; username: string }>("/api/auth/login", {
        method: "POST",
        body: { username: name, password },
        auth: false,
      });
      setSession(session.token, session.username);
      onAuthed(session.username);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const tabClass = (active: boolean) =>
    active
      ? "rounded-md bg-white py-1.5 text-sm font-medium text-slate-900 shadow-sm"
      : "rounded-md py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Markdown Notes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Write in Markdown, publish with a shareable link.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          <button type="button" className={tabClass(mode === "login")} onClick={() => switchMode("login")}>
            Sign in
          </button>
          <button
            type="button"
            className={tabClass(mode === "register")}
            onClick={() => switchMode("register")}
          >
            Create account
          </button>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              placeholder="yourname"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
