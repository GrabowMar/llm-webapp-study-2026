import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError, register } from "../lib/api";
import { Link, useRouter } from "../lib/router";
import { Banner, Card, Field, PageTitle, PrimaryButton, TextInput } from "../components/ui";

export default function RegisterPage() {
  const { navigate } = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const account = await register(username.trim(), password);
      setDone(account.username);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message || "Could not create the account." : "Could not create the account.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <PageTitle title="Create an account" subtitle="Pick a username and a password." />

        {error ? (
          <div className="mb-4">
            <Banner tone="error" title="Registration failed">
              {error}
            </Banner>
          </div>
        ) : null}

        {done ? (
          <div className="mb-4">
            <Banner tone="success" title="Account created">
              <p>
                <span className="font-semibold">{done}</span> is ready.{" "}
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="font-semibold underline"
                >
                  Sign in now
                </button>
              </p>
            </Banner>
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="Username" htmlFor="new-username">
            <TextInput
              id="new-username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="your-name"
              required
            />
          </Field>

          <Field label="Password" htmlFor="new-password">
            <TextInput
              id="new-password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
            />
          </Field>

          <Field label="Confirm password" htmlFor="confirm-password">
            <TextInput
              id="confirm-password"
              name="password-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="••••••••"
              required
            />
          </Field>

          <PrimaryButton type="submit" disabled={busy || done !== null}>
            {busy ? "Creating…" : "Create account"}
          </PrimaryButton>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already registered?{" "}
          <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
