import { useState, type FormEvent } from "react";
import { apiFetch } from "../api";
import type { Session } from "../api";

interface Props {
  onSignedIn: (session: Session) => void;
}

export default function AuthCard({ onSignedIn }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    const session = await apiFetch<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: { username, password },
    });
    onSignedIn({ token: session.token, username: username.trim() });
  }

  async function handleRegister() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: { username, password },
      });
      await signIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Account</h2>
      <p className="mt-1 text-sm text-slate-500">
        Sign in to keep a private history of your conversions.
      </p>
      <form onSubmit={handleSignIn} className="mt-4 space-y-3">
        <div>
          <label
            htmlFor="auth-username"
            className="block text-sm font-medium text-slate-700"
          >
            Username
          </label>
          <input
            id="auth-username"
            name="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="auth-password"
            className="block text-sm font-medium text-slate-700"
          >
            Password
          </label>
          <input
            id="auth-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleRegister}
            disabled={busy}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
          >
            Register
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Sign in
          </button>
        </div>
      </form>
    </section>
  );
}
