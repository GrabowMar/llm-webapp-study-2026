import { useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError, setSession } from "../api";
import { buttonClass, Field, inputClass } from "../components";

interface Props {
  onSignedIn: (username: string) => void;
}

export default function AuthPage({ onSignedIn }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register(username, password);
      }
      const { token } = await api.login(username, password);
      setSession(token, username);
      onSignedIn(username);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? mode === "register" && err.status !== 401
            ? err.message
            : err.message
          : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-md">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">
          {mode === "login" ? "Sign in" : "Create an account"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === "login"
            ? "Welcome back — sign in to manage your subscriptions."
            : "Join your team to manage subscriptions and invoices."}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Username">
            <input
              className={inputClass}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
            />
          </Field>
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
              {error}
            </p>
          )}
          <button
            type="submit"
            className={`${buttonClass} w-full`}
            disabled={busy}
          >
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Register & sign in"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          {mode === "login" ? (
            <>
              No account yet?{" "}
              <button
                type="button"
                className="font-semibold text-indigo-600 hover:text-indigo-500"
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
              >
                Register
              </button>
            </>
          ) : (
            <>
              Already registered?{" "}
              <button
                type="button"
                className="font-semibold text-indigo-600 hover:text-indigo-500"
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
