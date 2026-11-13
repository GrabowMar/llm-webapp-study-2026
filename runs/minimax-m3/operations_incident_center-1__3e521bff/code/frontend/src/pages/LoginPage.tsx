import { useState } from "react";
import { ApiError } from "../api";
import { useAuth } from "../auth";
import { navigate } from "../router";
import { Card, ErrorBanner, Field, buttonPrimary, inputClass } from "../ui";

export default function LoginPage() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await signIn(username.trim(), password);
      navigate("/incidents");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors);
      } else {
        setError("Could not sign in");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <Card className="p-6">
        <h1 className="text-2xl font-bold text-slate-50">Sign in</h1>
        <p className="mt-1 text-sm text-slate-400">
          Use your operations team account.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <ErrorBanner message={error} errors={fieldErrors} />
          <Field label="Username" error={fieldErrors.username}>
            <input
              className={inputClass}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Password" error={fieldErrors.password}>
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <button type="submit" className={`${buttonPrimary} w-full`} disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-400">
          No account yet?{" "}
          <a
            href="#/register"
            className="font-medium text-cyan-400 underline underline-offset-2 hover:text-cyan-300"
          >
            Create one
          </a>
        </p>
      </Card>
    </div>
  );
}
