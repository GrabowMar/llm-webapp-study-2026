import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmPasswordReset } from "../api";
import { Button, Card, Notice, TextField } from "../ui";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setDone(false);
    if (password !== confirmation) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset(token, password);
      setDone(true);
      setPassword("");
      setConfirmation("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset the password");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Card title="Reset your password">
        <Notice tone="error">
          This link is missing its reset token. Ask for a new reset link.
        </Notice>
        <p className="mt-4 text-sm text-slate-500">
          <Link
            to="/forgot-password"
            className="font-medium text-indigo-600 underline-offset-2 hover:underline"
          >
            Forgot your password?
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <Card
      title="Choose a new password"
      description="The reset link can be used only once."
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <TextField
          id="new-password"
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          required
          hint="At least 8 characters."
        />
        <TextField
          id="repeat-password"
          label="Repeat new password"
          type="password"
          value={confirmation}
          onChange={setConfirmation}
          autoComplete="new-password"
          required
        />
        {error ? <Notice tone="error">{error}</Notice> : null}
        {done ? (
          <Notice tone="success">
            Your password was changed. You can sign in with it now.
          </Notice>
        ) : null}
        <Button disabled={busy}>{busy ? "Saving…" : "Set new password"}</Button>
        {done ? (
          <p className="text-sm text-slate-500">
            <Link
              to="/"
              className="font-medium text-indigo-600 underline-offset-2 hover:underline"
            >
              Go to sign in
            </Link>
          </p>
        ) : null}
      </form>
    </Card>
  );
}
