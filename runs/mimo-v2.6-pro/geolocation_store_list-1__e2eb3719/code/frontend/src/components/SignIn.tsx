import { useState } from "react";
import type { FormEvent } from "react";

interface Props {
  onSignIn: (username: string, password: string) => Promise<void>;
}

export default function SignIn({ onSignIn }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSignIn(username, password);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col text-xs font-medium text-slate-600">
        Username
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          className="mt-1 w-36 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
        />
      </label>
      <label className="flex flex-col text-xs font-medium text-slate-600">
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="mt-1 w-36 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
      {error !== null && (
        <p role="alert" className="w-full text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
