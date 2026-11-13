import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../api";
import { Button, Card, Notice, TextField } from "../ui";

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await requestPasswordReset(identifier);
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Forgot your password?"
      description="Enter your username or your email address and we will send a reset link to the address on the account."
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <TextField
          id="reset-identifier"
          label="Username or email address"
          value={identifier}
          onChange={setIdentifier}
          autoComplete="username"
          required
        />
        {error ? <Notice tone="error">{error}</Notice> : null}
        {message ? <Notice tone="success">{message}</Notice> : null}
        <Button disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button>
      </form>
      <p className="mt-6 text-sm text-slate-500">
        No real email is sent. Open the{" "}
        <Link
          to="/mailbox"
          className="font-medium text-indigo-600 underline-offset-2 hover:underline"
        >
          Mailbox
        </Link>{" "}
        to read the message that was produced for the account.
      </p>
    </Card>
  );
}
