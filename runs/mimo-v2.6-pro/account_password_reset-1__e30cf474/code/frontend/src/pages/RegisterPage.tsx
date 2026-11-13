import { useState } from "react";
import type { FormEvent } from "react";
import type { Account } from "../api";
import { api, setToken } from "../api";
import { navigate } from "../router";
import { Card, Field, Notice, buttonClass, inputClass } from "../components/ui";

export default function RegisterPage({
  onSignedIn,
}: {
  onSignedIn: (user: Account) => void;
}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: {
          username,
          password,
          email: email.trim() === "" ? null : email.trim(),
        },
      });
      const { token } = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: { username, password },
      });
      setToken(token);
      const user = await api<Account>("/api/me");
      onSignedIn(user);
      navigate("/account");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card title="Create an account">
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
          <Field label="Email" hint="Optional, but needed to reset a forgotten password.">
            <input
              className={inputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </Field>
          <Field label="Password" hint="At least 8 characters.">
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>
          <button className={`${buttonClass} w-full`} disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>
        <p className="mt-4 text-sm">
          Already have an account?{" "}
          <button
            type="button"
            className="font-medium text-indigo-600 hover:underline"
            onClick={() => navigate("/login")}
          >
            Sign in
          </button>
        </p>
      </Card>
    </div>
  );
}
