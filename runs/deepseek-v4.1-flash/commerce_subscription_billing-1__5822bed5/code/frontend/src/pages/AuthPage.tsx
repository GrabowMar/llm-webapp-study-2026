import { useState } from "react";
import { api, setToken } from "../api";

export function AuthPage({
  mode,
  onSignedIn,
}: {
  mode: "login" | "register";
  onSignedIn: (username: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isRegister) {
        await api("/auth/register", {
          method: "POST",
          body: { username, password },
        });
      }
      const res = await api<{ token: string }>("/auth/login", {
        method: "POST",
        body: { username, password },
      });
      setToken(res.token);
      onSignedIn(username.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">{isRegister ? "Create account" : "Sign in"}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isRegister
            ? "Register a team member account."
            : "Sign in to manage subscriptions."}
        </p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isRegister ? "new-password" : "current-password"}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? "Please wait…" : isRegister ? "Register" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          {isRegister ? (
            <a href="/login" className="font-medium text-slate-800 hover:underline">
              Already have an account? Sign in
            </a>
          ) : (
            <a href="/register" className="font-medium text-slate-800 hover:underline">
              Need an account? Register
            </a>
          )}
        </p>
      </div>
    </div>
  );
}
