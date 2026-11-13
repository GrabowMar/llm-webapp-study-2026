import { useState, type FormEvent } from "react";
import { ApiError, login, register } from "../api";
import { ErrorBanner, Field, inputClass, primaryButton } from "../ui";

export default function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFieldErrors({});
    try {
      if (mode === "register") await register(username, password);
      await login(username, password);
      onSignedIn();
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
        if (Object.keys(err.fieldErrors).length === 0) setError(err.message);
      } else {
        setError("Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  }

  const isLogin = mode === "login";
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow">
        <h1 className="text-2xl font-bold text-slate-900">Customer directory</h1>
        <p className="mt-2 text-sm text-slate-600">
          A shared, private address book for your team. Keep every customer's details in one
          place and log the calls, emails and meetings you have with them.
        </p>
        <h2 className="mt-6 text-lg font-semibold text-slate-900">
          {isLogin ? "Sign in" : "Create an account"}
        </h2>
        <form onSubmit={submit} className="mt-4 space-y-4">
          {error && <ErrorBanner message={error} />}
          <Field label="Username" htmlFor="username" error={fieldErrors.username}>
            <input
              id="username"
              className={inputClass}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Password" htmlFor="password" error={fieldErrors.password}>
            <input
              id="password"
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
            />
          </Field>
          <button type="submit" className={`${primaryButton} w-full`} disabled={busy}>
            {isLogin ? "Sign in" : "Register and sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600">
          {isLogin ? "New to the team?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="font-medium text-indigo-600 hover:underline"
            onClick={() => {
              setMode(isLogin ? "register" : "login");
              setError("");
              setFieldErrors({});
            }}
          >
            {isLogin ? "Register" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
