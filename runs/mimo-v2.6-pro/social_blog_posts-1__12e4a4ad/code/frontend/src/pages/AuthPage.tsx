import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api";
import type { Auth } from "../api";
import { Link } from "../router";

export default function AuthPage({
  mode,
  onSignIn,
}: {
  mode: "login" | "register";
  onSignIn: (auth: Auth) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isRegister) {
        await api("/api/auth/register", { method: "POST", body: { username, password } });
      }
      const { token } = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: { username, password },
      });
      onSignIn({ token, username });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold">{isRegister ? "Create an account" : "Sign in"}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {isRegister ? (
          <>
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-indigo-700 hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            No account yet?{" "}
            <Link to="/register" className="font-medium text-indigo-700 hover:underline">
              Register
            </Link>
          </>
        )}
      </p>
      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="auth-username" className="block text-sm font-medium text-slate-700">
            Username
          </label>
          <input
            id="auth-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
            autoComplete="username"
          />
        </div>
        <div>
          <label htmlFor="auth-password" className="block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
            autoComplete={isRegister ? "new-password" : "current-password"}
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Please wait…" : isRegister ? "Register" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
