import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../auth";
import { ApiError } from "../api";
import { Link } from "../router";
import { Alert, TextField } from "./ui";

function AuthForms() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(username, password);
      } else {
        await signUp(username, password);
      }
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors(caught.errors);
      } else {
        setError("Could not sign in. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex gap-2">
          {(["login", "register"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                setError(null);
                setFieldErrors({});
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                mode === value
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {value === "login" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            id="username"
            label="Username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            error={fieldErrors.username}
            placeholder="your-name"
          />
          <TextField
            id="password"
            label="Password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password}
            placeholder="••••••••"
          />
          {error ? <Alert tone="error">{error}</Alert> : null}
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function Header() {
  const { user, signOut } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-4">
        <Link to="/" className="text-lg font-bold tracking-tight text-slate-900">
          📚 Book Library
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium text-slate-600">
          <Link to="/" className="transition hover:text-indigo-600">
            Books
          </Link>
          {user ? (
            <Link to="/books/new" className="transition hover:text-indigo-600">
              Add book
            </Link>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-slate-600">
                Signed in as <span className="font-semibold text-slate-900">{user.username}</span>
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowAuth((value) => !value)}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              {showAuth ? "Close" : "Sign in / Register"}
            </button>
          )}
        </div>
      </div>
      {showAuth && !user ? <AuthForms /> : null}
    </header>
  );
}
