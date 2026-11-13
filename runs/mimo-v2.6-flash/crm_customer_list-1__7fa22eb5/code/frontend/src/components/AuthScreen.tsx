import { useState } from "react";
import { api, ApiError, errorMessage, setSession } from "../api";

type Props = {
  onSignedIn: (username: string) => void;
};

export default function AuthScreen({ onSignedIn }: Props) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      if (mode === "register") {
        await api("/api/auth/register", { method: "POST", body: { username, password } });
      }
      const result = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: { username, password },
      });
      setSession(result.token, username.trim());
      onSignedIn(username.trim());
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: "signin" | "register") {
    setMode(next);
    setError(null);
    setFieldErrors({});
  }

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <div className="bg-slate-900 px-6 py-12 text-slate-100 lg:flex lg:w-1/2 lg:flex-col lg:justify-center lg:px-16">
        <div className="mx-auto max-w-md">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-400">
            Team workspace
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Customer Directory</h1>
          <p className="mt-4 text-slate-300">
            A private directory of the team's customers. Every signed-in team member can read and
            update every customer, and log the calls, emails and meetings they have had with them.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-slate-400">
            <li>Search customers by name, email or phone and filter by company.</li>
            <li>Open a customer to see their details and full interaction history.</li>
            <li>Only signed-in team members can see anything in the directory.</li>
          </ul>
        </div>
      </div>

      <div className="flex items-center justify-center px-4 py-12 lg:w-1/2 lg:px-16">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex gap-2 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                mode === "signin" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                mode === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              Register
            </button>
          </div>

          <h2 className="mt-6 text-xl font-semibold text-slate-900">
            {mode === "signin" ? "Sign in to the directory" : "Create your account"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {mode === "signin"
              ? "Use your team username and password."
              : "Register a team account to start using the directory."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

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
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {fieldErrors.username && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.username}</p>
              )}
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
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Register"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
