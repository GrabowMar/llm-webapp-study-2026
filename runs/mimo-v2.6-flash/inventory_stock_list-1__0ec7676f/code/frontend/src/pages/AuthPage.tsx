import { useEffect, useState, type FormEvent } from "react";
import Link, { navigate } from "../router";
import { api, toApiError } from "../api";

interface Props {
  mode: "login" | "register";
  user: string | null;
  onSignIn: (token: string, username: string) => void;
}

export default function AuthPage({ mode, user, onSignIn }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate("/");
  }, [user]);

  const isRegister = mode === "register";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      if (isRegister) await api.register(username, password);
      const { token } = await api.login(username, password);
      onSignIn(token, username);
      navigate("/");
    } catch (err) {
      const apiError = toApiError(err);
      setError(apiError.message);
      setFieldErrors(apiError.errors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">
          {isRegister ? "Create an account" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isRegister
            ? "Register to add items and record stock movements."
            : "Sign in to manage items and record stock movements."}
        </p>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            {fieldErrors.username && (
              <p className="mt-1 text-sm text-red-600">{fieldErrors.username}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            {fieldErrors.password && (
              <p className="mt-1 text-sm text-red-600">{fieldErrors.password}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60"
          >
            {busy ? "Please wait…" : isRegister ? "Register" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-600">
          {isRegister ? (
            <>
              Already have an account?{" "}
              <Link to="/login" className="text-sky-700 hover:underline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              Need an account?{" "}
              <Link to="/register" className="text-sky-700 hover:underline">
                Register
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
