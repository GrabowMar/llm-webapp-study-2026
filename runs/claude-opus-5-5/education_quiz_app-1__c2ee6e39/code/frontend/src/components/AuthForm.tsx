import { useState } from "react";
import { ApiError, api, setToken, type User } from "../api";

interface Props {
  mode: "login" | "register";
  onSignedIn: (user: User) => void;
  onSwitch: (mode: "login" | "register") => void;
}

export default function AuthForm({ mode, onSignedIn, onSwitch }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const isLogin = mode === "login";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      if (!isLogin) await api.register(username, password);
      const res = await api.login(username, password);
      setToken(res.token);
      onSignedIn({ username: res.username, is_admin: res.is_admin });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors);
      } else {
        setError("Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  }

  const input =
    "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

  return (
    <div className="mx-auto max-w-sm rounded-xl bg-white p-6 shadow">
      <h2 className="mb-4 text-xl font-semibold">{isLogin ? "Sign in" : "Create an account"}</h2>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Username</span>
          <input
            className={input}
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          {fieldErrors.username && (
            <span className="mt-1 block text-sm text-red-600">{fieldErrors.username}</span>
          )}
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <input
            className={input}
            type="password"
            name="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {fieldErrors.password && (
            <span className="mt-1 block text-sm text-red-600">{fieldErrors.password}</span>
          )}
        </label>
        {error && Object.keys(fieldErrors).length === 0 && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Please wait…" : isLogin ? "Sign in" : "Register"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        {isLogin ? "No account yet? " : "Already have an account? "}
        <button
          type="button"
          className="font-medium text-indigo-600 hover:underline"
          onClick={() => onSwitch(isLogin ? "register" : "login")}
        >
          {isLogin ? "Register" : "Sign in"}
        </button>
      </p>
    </div>
  );
}
