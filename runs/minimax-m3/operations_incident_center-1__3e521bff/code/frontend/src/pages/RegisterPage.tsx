import { useState } from "react";
import { ApiError } from "../api";
import { useAuth } from "../auth";
import { navigate } from "../router";
import { Card, ErrorBanner, Field, buttonPrimary, inputClass } from "../ui";

export default function RegisterPage() {
  const { signUp, signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (password !== confirm) {
      setFieldErrors({ confirm: "passwords do not match" });
      return;
    }
    setBusy(true);
    try {
      await signUp(username.trim(), password);
      await signIn(username.trim(), password);
      navigate("/incidents");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors);
      } else {
        setError("Could not create the account");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <Card className="p-6">
        <h1 className="text-2xl font-bold text-slate-50">Create an account</h1>
        <p className="mt-1 text-sm text-slate-400">
          Every team member can open and update incidents.
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
          <Field label="Password" error={fieldErrors.password} hint="At least 6 characters">
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>
          <Field label="Confirm password" error={fieldErrors.confirm}>
            <input
              className={inputClass}
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>
          <button type="submit" className={`${buttonPrimary} w-full`} disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-400">
          Already registered?{" "}
          <a
            href="#/login"
            className="font-medium text-cyan-400 underline underline-offset-2 hover:text-cyan-300"
          >
            Sign in
          </a>
        </p>
      </Card>
    </div>
  );
}
