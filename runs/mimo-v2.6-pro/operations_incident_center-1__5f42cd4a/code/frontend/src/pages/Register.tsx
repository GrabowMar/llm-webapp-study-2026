import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { Card, ErrorBanner, FieldError, inputClass, primaryButtonClass } from "../ui";

export default function RegisterPage() {
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
      await api.register(username, password);
      const { token } = await api.login(username, password);
      signIn(token, username);
      navigate("/incidents", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "Registration failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Card>
        <h1 className="text-xl font-bold text-slate-900">Register</h1>
        <p className="mt-1 text-sm text-slate-500">Create an account for the operations team.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <ErrorBanner message={error && !error.fields.username && !error.fields.password ? error.message : null} />
          <div>
            <label htmlFor="register-username" className="block text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              id="register-username"
              className={`${inputClass} mt-1`}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
            <FieldError message={error?.fields.username} />
          </div>
          <div>
            <label htmlFor="register-password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="register-password"
              type="password"
              className={`${inputClass} mt-1`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <FieldError message={error?.fields.password} />
          </div>
          <button type="submit" className={`${primaryButtonClass} w-full`} disabled={busy}>
            {busy ? "Creating account..." : "Register"}
          </button>
        </form>
        <p className="mt-4 text-sm text-slate-500">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
