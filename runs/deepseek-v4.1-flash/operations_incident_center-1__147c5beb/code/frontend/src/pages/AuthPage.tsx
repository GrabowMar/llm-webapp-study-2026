import { useState } from "react";
import { ApiError, login, register } from "../api";
import { useAuth } from "../auth";
import { Notice } from "../ui";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFields({});
    setBusy(true);
    try {
      if (isRegister) {
        await register(username, password);
      }
      const session = await login(username, password);
      signIn(session.token, username);
      window.history.pushState(null, "", "/incidents");
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600";

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold text-slate-900">
        {isRegister ? "Create an account" : "Sign in"}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {isRegister
          ? "Register to open and manage incidents."
          : "Sign in to manage incidents."}
      </p>
      <form
        onSubmit={submit}
        className="mt-6 space-y-4 rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200"
      >
        {error && <Notice tone="error">{error}</Notice>}
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-slate-700">
            Username
          </label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            className={inputClass}
          />
          {fields.username && (
            <p className="mt-1 text-sm text-red-600">{fields.username}</p>
          )}
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? "new-password" : "current-password"}
            className={inputClass}
          />
          {fields.password && (
            <p className="mt-1 text-sm text-red-600">{fields.password}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
        >
          {busy ? "Please wait…" : isRegister ? "Register" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        {isRegister ? (
          <>
            Already have an account?{" "}
            <a href="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
              Sign in
            </a>
          </>
        ) : (
          <>
            Need an account?{" "}
            <a
              href="/register"
              className="font-semibold text-indigo-600 hover:text-indigo-500"
            >
              Register
            </a>
          </>
        )}
      </p>
    </div>
  );
}
