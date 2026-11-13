import { useState } from "react";

import { login, storeAuth } from "../api";
import {
  ErrorBox,
  Field,
  inputClass,
  primaryButtonClass,
} from "../components/ui";
import type { Auth, Route } from "../route";

export default function Login({
  navigate,
  onSignedIn,
}: {
  navigate: (route: Route) => void;
  onSignedIn: (auth: Auth) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const token = await login(username, password);
      storeAuth(token, username);
      onSignedIn({ username });
      navigate({ name: "list" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Sign in</h1>
      <ErrorBox message={error} />
      <form className="rounded-lg bg-white p-6 shadow" onSubmit={handleSubmit}>
        <Field label="Username">
          <input
            className={inputClass}
            value={username}
            autoComplete="username"
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <input
            className={inputClass}
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <button type="submit" className={primaryButtonClass} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-600">
        No account yet?{" "}
        <button
          className="font-medium text-indigo-700 hover:underline"
          onClick={() => navigate({ name: "register" })}
        >
          Register
        </button>
      </p>
    </div>
  );
}
