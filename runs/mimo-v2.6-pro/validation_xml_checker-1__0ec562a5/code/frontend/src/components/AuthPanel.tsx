import { useState } from "react";
import type { FormEvent } from "react";
import { login, register } from "../api";
import type { Session } from "../types";

type AuthFormProps = {
  title: string;
  hint: string;
  submitLabel: string;
  passwordAutoComplete: string;
  onSubmit: (username: string, password: string) => Promise<void>;
};

function AuthForm({ title, hint, submitLabel, passwordAutoComplete, onSubmit }: AuthFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
      <label className="mt-3 block text-xs font-medium text-slate-600">
        Username
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </label>
      <label className="mt-2 block text-xs font-medium text-slate-600">
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={passwordAutoComplete}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </label>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mt-4 w-full rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </form>
  );
}

export default function AuthPanel({
  session,
  onSignedIn,
  onSignOut,
}: {
  session: Session | null;
  onSignedIn: (session: Session) => void;
  onSignOut: () => void;
}) {
  if (session) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm text-slate-700">
          Signed in as <span className="font-semibold text-slate-900">{session.username}</span>
        </p>
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <AuthForm
        title="Sign in"
        hint="Use your existing account to save and revisit checks."
        submitLabel="Sign in"
        passwordAutoComplete="current-password"
        onSubmit={async (username, password) => {
          const token = await login(username, password);
          onSignedIn({ token, username });
        }}
      />
      <AuthForm
        title="Create account"
        hint="Checking works without an account; one is needed to save history."
        submitLabel="Create account"
        passwordAutoComplete="new-password"
        onSubmit={async (username, password) => {
          await register(username, password);
          const token = await login(username, password);
          onSignedIn({ token, username });
        }}
      />
    </div>
  );
}
