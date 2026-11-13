import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, confirmPasswordReset } from "../api";
import { Alert, Button, Card, Field, Heading } from "../ui";

export default function Reset() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(token ? null : "This reset link is missing its token.");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("The passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await confirmPasswordReset(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Heading>Choose a new password</Heading>
      {done ? (
        <div className="space-y-4">
          <Alert kind="success">Password updated. You can now sign in.</Alert>
          <Link to="/login" className="block text-sm text-blue-600 hover:underline">
            Go to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert kind="error">{error}</Alert>}
          <Field
            label="New password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            disabled={!token}
            autoFocus
          />
          <Field
            label="Repeat new password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            disabled={!token}
          />
          <Button type="submit" disabled={busy || !token}>
            {busy ? "Saving…" : "Set new password"}
          </Button>
        </form>
      )}
    </Card>
  );
}
