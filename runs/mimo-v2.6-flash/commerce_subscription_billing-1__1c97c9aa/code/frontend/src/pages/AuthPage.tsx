import { useState, type FormEvent } from "react";
import { api, errorMessage, signIn } from "../api";
import { ErrorNote } from "../components";
import { navigate } from "../router";

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
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
      signIn(token, username);
      navigate("/subscriptions");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const isRegister = mode === "register";

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          {isRegister ? "Create an account" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isRegister
            ? "Register a team account to manage subscriptions."
            : "Sign in to manage subscriptions."}
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-slate-700"
            >
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          <ErrorNote message={error} />

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy
              ? "Working…"
              : isRegister
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          {isRegister ? (
            <a
              href="/login"
              onClick={(event) => {
                event.preventDefault();
                navigate("/login");
              }}
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              Already have an account? Sign in
            </a>
          ) : (
            <a
              href="/register"
              onClick={(event) => {
                event.preventDefault();
                navigate("/register");
              }}
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              Need an account? Register
            </a>
          )}
        </p>
      </div>
    </div>
  );
}
