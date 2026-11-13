import { useState } from "react";

import { login, register, storeAuth } from "../api";
import {
  ErrorBox,
  Field,
  inputClass,
  primaryButtonClass,
} from "../components/ui";
import type { Auth, Route } from "../route";

export default function Register({
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
      await register(username, password);
      const token = await login(username, password);
      storeAuth(token, username);
      onSignedIn({ username });
      navigate({ name: "list" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Register</h1>
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
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <button type="submit" className={primaryButtonClass} disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-600">
        Already have an account?{" "}
        <button
          className="font-medium text-indigo-700 hover:underline"
          onClick={() => navigate({ name: "login" })}
        >
          Sign in
        </button>
      </p>
    </div>
  );
}
