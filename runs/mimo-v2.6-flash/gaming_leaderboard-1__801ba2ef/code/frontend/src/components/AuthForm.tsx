import { useState, type FormEvent } from "react";
import { ApiError, apiPost, setToken } from "../api";

type Props = {
  onSignedIn: () => void;
};

export default function AuthForm({ onSignedIn }: Props) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await apiPost("/api/auth/register", { username, password });
        setNotice("Account created — sign in to play.");
        setMode("signin");
        setPassword("");
      } else {
        const result = await apiPost<{ token: string }>("/api/auth/login", {
          username,
          password,
        });
        setToken(result.token);
        await onSignedIn();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: "signin" | "register") {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => switchMode("signin")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            mode === "signin"
              ? "bg-indigo-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => switchMode("register")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            mode === "register"
              ? "bg-indigo-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Register
        </button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label
            htmlFor="auth-username"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Username
          </label>
          <input
            id="auth-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <div>
          <label
            htmlFor="auth-password"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          {busy
            ? "Please wait…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>
    </div>
  );
}
