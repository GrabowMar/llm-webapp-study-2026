import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";

interface Props {
  mode: "signin" | "register";
  onModeChange: (mode: "signin" | "register") => void;
  onAuthed: (token: string, username: string) => void;
}

export default function AuthPanel({ mode, onModeChange, onAuthed }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isRegister) {
        await api.register(username, password);
      }
      const { token } = await api.login(username, password);
      onAuthed(token, username);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            onModeChange("signin");
            setError(null);
          }}
          className={
            isRegister
              ? "rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              : "rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white"
          }
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            onModeChange("register");
            setError(null);
          }}
          className={
            isRegister
              ? "rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white"
              : "rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          }
        >
          Create account
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 max-w-md space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </div>
        )}
        <div>
          <label htmlFor="auth-username" className="mb-1 block text-sm font-medium text-slate-700">
            Username
          </label>
          <input
            id="auth-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <div>
          <label htmlFor="auth-password" className="mb-1 block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
