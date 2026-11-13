import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api";
import { navigate } from "../router";
import { Card, Field, Notice, buttonClass, inputClass } from "../components/ui";

export default function ForgotPage() {
  const [identifier, setIdentifier] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const value = identifier.trim();
      const body = value.includes("@")
        ? { email: value }
        : { username: value };
      await api("/api/auth/password-reset", { method: "POST", body });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card title="Forgot password?">
        {sent ? (
          <Notice tone="ok">
            If the account exists, a reset link is on its way.
          </Notice>
        ) : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <form onSubmit={submit}>
          <Field
            label="Username or email"
            hint="We will send a single-use reset link to the address on file."
          >
            <input
              className={inputClass}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </Field>
          <button className={`${buttonClass} w-full`} disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
        <div className="mt-4 flex justify-between text-sm">
          <button
            type="button"
            className="font-medium text-indigo-600 hover:underline"
            onClick={() => navigate("/login")}
          >
            Back to sign in
          </button>
          <button
            type="button"
            className="font-medium text-indigo-600 hover:underline"
            onClick={() => navigate("/mailbox")}
          >
            Open mailbox
          </button>
        </div>
      </Card>
    </div>
  );
}
