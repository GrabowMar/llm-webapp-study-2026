import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { Card, ErrorBanner, FieldError, inputClass, primaryButtonClass } from "../ui";

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.login(username, password);
      signIn(token, username);
      navigate("/incidents", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "Sign in failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Card>
        <h1 className="text-xl font-bold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to open and update incidents.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <ErrorBanner message={error && !error.fields.username && !error.fields.password ? error.message : null} />
          <div>
            <label htmlFor="login-username" className="block text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              id="login-username"
              className={`${inputClass} mt-1`}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
            <FieldError message={error?.fields.username} />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              className={`${inputClass} mt-1`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <FieldError message={error?.fields.password} />
          </div>
          <button type="submit" className={`${primaryButtonClass} w-full`} disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-sm text-slate-500">
          No account?{" "}
          <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500">
            Register
          </Link>
        </p>
      </Card>
    </div>
  );
}
