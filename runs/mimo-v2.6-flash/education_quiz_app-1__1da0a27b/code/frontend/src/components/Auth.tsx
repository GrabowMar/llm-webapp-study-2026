import { useState } from "react";
import { api, errorMessage, setToken } from "../api";
import type { User } from "../types";

interface AuthProps {
  mode: "login" | "register";
  setMode: (mode: "login" | "register") => void;
  onSuccess: (user: User) => void;
}

export default function Auth({ mode, setMode, onSuccess }: AuthProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await api("/api/auth/register", {
          method: "POST",
          body: { username, password },
        });
      }
      const session = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: { username, password },
      });
      setToken(session.token);
      const user = await api<User>("/api/auth/me");
      onSuccess(user);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const isLogin = mode === "login";

  return (
    <section className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">
        {isLogin ? "Sign in" : "Create account"}
      </h1>
      <p className="mb-5 text-sm text-slate-500">
        {isLogin
          ? "Sign in to keep a history of your attempts."
          : "Register to keep a history of your attempts."}
      </p>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-700">
            Username
          </label>
          <input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isLogin ? "Sign in" : "Register"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-600">
        {isLogin ? "No account yet?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => {
            setError(null);
            setMode(isLogin ? "register" : "login");
          }}
          className="font-semibold text-indigo-600 hover:underline"
        >
          {isLogin ? "Register" : "Sign in"}
        </button>
      </p>
    </section>
  );
}
