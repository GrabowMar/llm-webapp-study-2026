import { useState } from "react";
import { ApiError, fieldErrors, login, register, saveSession } from "../api";

export default function Auth({
  onAuthed,
}: {
  onAuthed: (username: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await register(username, password);
        const res = await login(username, password);
        saveSession(res.token, res.username);
        onAuthed(res.username);
      } else {
        const res = await login(username, password);
        saveSession(res.token, res.username);
        onAuthed(res.username);
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  function message(err: unknown): string {
    if (err instanceof ApiError && err.status === 401) {
      return "Invalid username or password.";
    }
    if (err instanceof ApiError && err.status === 409) {
      return "That username is already taken.";
    }
    if (err instanceof ApiError && err.body) {
      const fe = fieldErrors(err.body);
      if (fe.username) return fe.username;
      if (fe.password) return fe.password;
    }
    return "Something went wrong. Please try again.";
  }

  const input =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

  return (
    <div className="w-full">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Event Calendar</h1>
      <p className="mb-6 text-sm text-slate-500">
        {mode === "login" ? "Sign in to your account" : "Create a new account"}
      </p>

      <div className="mb-6 flex rounded-lg bg-slate-100 p-1">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                mode === m
                  ? "bg-white text-slate-900 shadow"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {m === "login" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              className={input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              className={input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
  );
}
