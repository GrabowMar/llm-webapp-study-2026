import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, errorMessage } from "../api";
import { Alert, Button, Card, Field, TextInput } from "../components";

export default function ResetPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!token) {
      setError("This reset link is missing its token");
      return;
    }
    setBusy(true);
    try {
      await api.confirmReset(token, password);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4">
        <Card title="Password updated" subtitle="Your new password is ready.">
          <Alert tone="success">
            Your password has been reset. You can now sign in with it.
          </Alert>
          <Link to="/auth" className="mt-5 block">
            <Button className="w-full">Go to sign in</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <Card
        title="Set a new password"
        subtitle="Choose a new password of at least 8 characters."
      >
        {!token && (
          <div className="mb-4">
            <Alert tone="error">
              No reset token was found in the link. Open the link from your
              mailbox again.
            </Alert>
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <Field label="New password">
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="At least 8 characters"
            />
          </Field>
          <Field label="Confirm new password">
            <TextInput
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="Repeat your new password"
            />
          </Field>

          {error && <Alert tone="error">{error}</Alert>}

          <Button type="submit" disabled={busy || !token} className="w-full">
            {busy ? "Saving…" : "Set new password"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm">
          <Link
            to="/forgot-password"
            className="font-medium text-indigo-600 hover:underline"
          >
            Request a new link
          </Link>
        </p>
      </Card>
    </div>
  );
}
