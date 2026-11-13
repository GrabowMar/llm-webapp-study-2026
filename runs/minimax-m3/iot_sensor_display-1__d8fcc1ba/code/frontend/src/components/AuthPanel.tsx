import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { errorTextClass, inputClass, labelClass, primaryButtonClass, successTextClass } from "../ui";

function AuthForm({
  title,
  description,
  submitLabel,
  onSubmit,
}: {
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);
    setBusy(true);
    try {
      await onSubmit(username.trim(), password);
      setDone(true);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-100">{title}</h3>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>
      <div>
        <label className={labelClass} htmlFor={`${title}-username`}>
          Username
        </label>
        <input
          id={`${title}-username`}
          className={inputClass}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          required
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`${title}-password`}>
          Password
        </label>
        <input
          id={`${title}-password`}
          type="password"
          className={inputClass}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={title === "Sign in" ? "current-password" : "new-password"}
          required
        />
      </div>
      <button type="submit" className={primaryButtonClass} disabled={busy}>
        {busy ? "Working…" : submitLabel}
      </button>
      {error ? <p className={errorTextClass}>{error}</p> : null}
      {done ? <p className={successTextClass}>Success — you are signed in.</p> : null}
    </form>
  );
}

export default function AuthPanel() {
  const { signIn, signUp } = useAuth();

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <AuthForm
          title="Sign in"
          description="Use your account to register sensors and post readings."
          submitLabel="Sign in"
          onSubmit={signIn}
        />
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <AuthForm
          title="Create account"
          description="New here? Register a username and password to get started."
          submitLabel="Register"
          onSubmit={signUp}
        />
      </div>
    </div>
  );
}
