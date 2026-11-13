import { useState } from "react";
import { ApiError, login, register } from "../api";

interface AuthProps {
  mode: "signin" | "register";
  onModeChange: (mode: "signin" | "register") => void;
  onSignedIn: (token: string, username: string) => void;
}

export default function Auth({ mode, onModeChange, onSignedIn }: AuthProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await register(username, password);
        setNotice("Account created. You can sign in now.");
        setPassword("");
        onModeChange("signin");
      } else {
        const data = await login(username, password);
        onSignedIn(data.token, username);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              onModeChange("signin");
              setError(null);
              setNotice(null);
            }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
              mode === "signin"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              onModeChange("register");
              setError(null);
              setNotice(null);
            }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
              mode === "register"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Register
          </button>
        </div>

        <h1 className="text-xl font-semibold text-slate-900">
          {mode === "signin" ? "Sign in to your account" : "Create an account"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {mode === "signin"
            ? "Sign in to keep a history of your quiz attempts."
            : "Register to save your quiz attempts and track your progress."}
        </p>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            {notice}
          </div>
        ) : null}

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="auth-username" className="block text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              id="auth-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              required
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              required
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Register"}
          </button>
        </form>
      </div>
    </div>
  );
}
