import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { navigate } from "../router";

type Props = {
  mode: "login" | "register";
  onSignedIn: (token: string, username: string) => void;
};

export default function AuthForm({ mode, onSignedIn }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError("Username and password are required.");
      return;
    }
    setBusy(true);
    try {
      if (isRegister) await api.register(username.trim(), password);
      const res = await api.login(username.trim(), password);
      onSignedIn(res.token, res.username ?? username.trim());
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) setError("That username is already taken.");
        else if (err.status === 401) setError("Invalid username or password.");
        else setError(err.message);
      } else setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-semibold text-slate-800">Markdown Notes</h1>
        <form
          onSubmit={submit}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          aria-label={isRegister ? "Registration form" : "Sign-in form"}
        >
          <h2 className="text-lg font-medium text-slate-700">
            {isRegister ? "Create an account" : "Sign in"}
          </h2>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600">Username</span>
            <input
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600">Password</span>
            <input
              name="password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
            />
          </label>
          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? "Please wait…" : isRegister ? "Register" : "Sign in"}
          </button>
          <p className="text-center text-sm text-slate-500">
            {isRegister ? "Already have an account? " : "No account yet? "}
            <a
              href={isRegister ? "/login" : "/register"}
              onClick={(e) => {
                e.preventDefault();
                setError(null);
                navigate(isRegister ? "/login" : "/register");
              }}
              className="font-medium text-indigo-600 hover:underline"
            >
              {isRegister ? "Sign in" : "Register"}
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
