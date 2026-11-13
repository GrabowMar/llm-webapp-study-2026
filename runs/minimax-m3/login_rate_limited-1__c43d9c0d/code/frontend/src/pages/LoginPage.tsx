import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatClock, formatDuration } from "../lib/format";
import { Link, useRouter } from "../lib/router";
import { Banner, Card, Field, PageTitle, PrimaryButton, TextInput, useNow } from "../components/ui";

export default function LoginPage() {
  const { signIn } = useAuth();
  const { navigate } = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useNow();

  const remaining = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setRetryAt(null);
    try {
      await signIn(username.trim(), password);
      navigate("/account");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err);
        if (err.isTooMany) {
          if (err.lockedUntil) {
            setRetryAt(new Date(err.lockedUntil).getTime());
          } else if (err.retryAfter && err.retryAfter > 0) {
            setRetryAt(Date.now() + err.retryAfter * 1000);
          }
        }
      } else {
        setError(new ApiError(0, { message: "Could not reach the server." }, null));
      }
    } finally {
      setBusy(false);
    }
  }

  const blocked = remaining > 0;

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <PageTitle title="Sign in" subtitle="Use your username and password." />

        {error ? (
          <div className="mb-4">
            {error.isTooMany ? (
              <Banner tone="warning" title={error.isLocked ? "Account locked" : "Too many attempts"}>
                <p>
                  {error.isLocked
                    ? "This username is locked after 5 consecutive failed sign-ins."
                    : "This client made more than 20 sign-in attempts in the last minute."}
                </p>
                {blocked ? (
                  <p className="mt-1 font-semibold">
                    Try again in {formatDuration(remaining)} (at {formatClock(new Date(retryAt!).toISOString())}).
                  </p>
                ) : null}
              </Banner>
            ) : (
              <Banner tone="error" title="Sign-in failed">
                {error.message || "Invalid username or password."}
              </Banner>
            )}
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="Username" htmlFor="username">
            <TextInput
              id="username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="your-name"
              required
            />
          </Field>

          <Field label="Password" htmlFor="password">
            <TextInput
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
            />
          </Field>

          <PrimaryButton type="submit" disabled={busy || blocked}>
            {busy ? "Signing in…" : blocked ? `Locked — retry in ${remaining}s` : "Sign in"}
          </PrimaryButton>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          No account yet?{" "}
          <Link to="/register" className="font-semibold text-indigo-600 hover:text-indigo-500">
            Register
          </Link>
        </p>
      </Card>
    </div>
  );
}
