import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, registerAccount } from "../api";
import { useAuth } from "../auth";
import {
  buttonClass,
  Card,
  ErrorBanner,
  Field,
  inputClass,
} from "../ui";

export default function RegisterPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const trimmed = username.trim();
      await registerAccount(trimmed, password);
      const result = await login(trimmed, password);
      signIn({ token: result.token, username: trimmed });
      navigate("/subscriptions");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight">Register</h1>
      <p className="mt-1 text-sm text-slate-500">
        Create an account to manage subscriptions and invoices.
      </p>
      <div className="mt-6">
        <Card>
          {error ? <ErrorBanner message={error} /> : null}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Username">
              <input
                className={inputClass}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </Field>
            <Field label="Password">
              <input
                className={inputClass}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label="Confirm password">
              <input
                className={inputClass}
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
            <button
              type="submit"
              className={`${buttonClass("primary")} w-full`}
              disabled={busy}
            >
              {busy ? "Creating account…" : "Register"}
            </button>
          </form>
        </Card>
      </div>
      <p className="mt-4 text-sm text-slate-500">
        Already registered?{" "}
        <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
          Sign in
        </Link>
      </p>
    </div>
  );
}
