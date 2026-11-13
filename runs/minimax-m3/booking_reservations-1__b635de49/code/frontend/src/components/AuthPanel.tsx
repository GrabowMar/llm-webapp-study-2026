import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError, login, register } from "../api";
import { cardClass, cardTitleClass, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from "../ui";

type Props = {
  onSignedIn: (token: string) => void;
};

export default function AuthPanel({ onSignedIn }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await register(username.trim(), password);
        setMessage("Account created — signing you in…");
        const session = await login(username.trim(), password);
        onSignedIn(session.token);
        return;
      }
      const session = await login(username.trim(), password);
      onSignedIn(session.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-700">Maison Verte</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Table reservations</h1>
        <p className="mt-2 text-sm text-stone-500">
          Sign in to book a table, or create an account to get started.
        </p>
      </div>

      <div className={cardClass}>
        <h2 className={cardTitleClass}>{mode === "login" ? "Welcome back" : "Create your account"}</h2>

        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className={labelClass} htmlFor="username">
              Username
            </label>
            <input
              id="username"
              name="username"
              className={inputClass}
              value={username}
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className={inputClass}
              value={password}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {message ? (
            <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {message}
            </p>
          ) : null}

          <button type="submit" className={`${primaryButtonClass} w-full`} disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}
          </button>
        </form>

        <div className="mt-4 border-t border-stone-100 pt-4 text-center">
          {mode === "login" ? (
            <button
              type="button"
              className={`${secondaryButtonClass} w-full`}
              onClick={() => {
                setMode("register");
                setError(null);
                setMessage(null);
              }}
            >
              Need an account? Register
            </button>
          ) : (
            <button
              type="button"
              className={`${secondaryButtonClass} w-full`}
              onClick={() => {
                setMode("login");
                setError(null);
                setMessage(null);
              }}
            >
              Already registered? Sign in
            </button>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-stone-400">
        Availability is open to everyone — sign in only to manage your own bookings.
      </p>
    </div>
  );
}

export function AuthHeader({
  username,
  isAdmin,
  onSignOut,
}: {
  username: string;
  isAdmin: boolean;
  onSignOut: () => void;
}) {
  return (
    <header className="border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-700">Maison Verte</p>
          <h1 className="text-xl font-semibold tracking-tight text-stone-900">Table reservations</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-700">
            Signed in as <span className="font-semibold">{username}</span>
            {isAdmin ? (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                admin
              </span>
            ) : null}
          </span>
          <button type="button" className={secondaryButtonClass} onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
