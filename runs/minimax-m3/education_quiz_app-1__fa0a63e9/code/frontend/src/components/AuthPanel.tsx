import { useState } from "react";
import { ApiError, apiRequest, clearToken, setToken } from "@/api";
import type { User } from "@/types";

type Mode = "login" | "register";

interface AuthPanelProps {
  onAuthenticated: (user: User) => void;
}

export default function AuthPanel({ onAuthenticated }: AuthPanelProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setFieldErrors({});
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFieldErrors({});
    try {
      if (mode === "register") {
        await apiRequest<{ token: string; username: string }>("/api/auth/register", {
          method: "POST",
          body: { username, password },
          auth: false,
        });
        const result = await apiRequest<{ token: string }>("/api/auth/login", {
          method: "POST",
          body: { username, password },
          auth: false,
        });
        setToken(result.token);
      } else {
        const result = await apiRequest<{ token: string }>("/api/auth/login", {
          method: "POST",
          body: { username, password },
          auth: false,
        });
        setToken(result.token);
      }
      const user = await apiRequest<User>("/api/auth/me");
      onAuthenticated(user);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors);
        if (err.status === 401) clearToken();
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const isLogin = mode === "login";

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => switchMode("login")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            isLogin ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => switchMode("register")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            !isLogin ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Register
        </button>
      </div>

      <h2 className="text-xl font-bold text-slate-900">
        {isLogin ? "Welcome back" : "Create your account"}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        {isLogin
          ? "Sign in to keep a history of your quiz attempts."
          : "Register to save your attempts and track your scores."}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-slate-700">
            Username
          </label>
          <input
            id="username"
            name="username"
            value={username}
            autoComplete="username"
            onChange={(event) => setUsername(event.target.value)}
            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-indigo-500 ${
              fieldErrors.username ? "border-red-400 focus:ring-red-400" : "border-slate-300"
            }`}
          />
          {fieldErrors.username && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.username}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            autoComplete={isLogin ? "current-password" : "new-password"}
            onChange={(event) => setPassword(event.target.value)}
            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-indigo-500 ${
              fieldErrors.password ? "border-red-400 focus:ring-red-400" : "border-slate-300"
            }`}
          />
          {fieldErrors.password && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Please wait..." : isLogin ? "Sign in" : "Register"}
        </button>
      </form>
    </div>
  );
}
