import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api";
import { Alert, Button, Card, Field, TextInput } from "../components";

export default function ForgotPage() {
  const [identifier, setIdentifier] = useState("");
  const [notice, setNotice] = useState(
    "If the account exists, a reset link is on its way",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api.requestReset(identifier);
      setNotice(result.message);
      setIdentifier("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <Card
        title="Forgot your password?"
        subtitle="Enter your username or email address and we'll send a reset link."
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Username or email">
            <TextInput
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              placeholder="jane or jane@example.com"
            />
          </Field>

          {error && <Alert tone="error">{error}</Alert>}
          {notice && <Alert tone="success">{notice}</Alert>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Sending…" : "Send reset link"}
          </Button>
        </form>

        <div className="mt-5 space-y-2 text-center text-sm text-slate-500">
          <p>
            This app sends no real email.{" "}
            <Link
              to="/mailbox"
              className="font-medium text-indigo-600 hover:underline"
            >
              Open the mailbox
            </Link>{" "}
            to find your link.
          </p>
          <p>
            <Link
              to="/auth"
              className="font-medium text-indigo-600 hover:underline"
            >
              Back to sign in
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
