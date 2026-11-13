import { useState } from "react";
import type { FormEvent } from "react";
import type { Account } from "../api";
import { api, setToken } from "../api";
import { navigate } from "../router";
import { Card, Field, Notice, buttonClass, inputClass } from "../components/ui";

export default function LoginPage({
  onSignedIn,
}: {
  onSignedIn: (user: Account) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { token } = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: { username, password },
      });
      setToken(token);
      const user = await api<Account>("/api/me");
      onSignedIn(user);
      navigate("/account");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card title="Sign in">
        {error ? <Notice tone="error">{error}</Notice> : null}
        <form onSubmit={submit}>
          <Field label="Username">
            <input
              className={inputClass}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Password">
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <button className={`${buttonClass} w-full`} disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="mt-4 flex justify-between text-sm">
          <button
            type="button"
            className="font-medium text-indigo-600 hover:underline"
            onClick={() => navigate("/register")}
          >
            Create an account
          </button>
          <button
            type="button"
            className="font-medium text-indigo-600 hover:underline"
            onClick={() => navigate("/forgot")}
          >
            Forgot password?
          </button>
        </div>
      </Card>
    </div>
  );
}
