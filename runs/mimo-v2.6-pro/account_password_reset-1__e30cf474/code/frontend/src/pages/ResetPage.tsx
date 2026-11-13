import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api";
import { navigate } from "../router";
import { Card, Field, Notice, buttonClass, inputClass } from "../components/ui";

export default function ResetPage() {
  const token = new URLSearchParams(window.location.search).get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/password-reset/confirm", {
        method: "POST",
        body: { token, new_password: password },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md">
        <Card title="Reset your password">
          <Notice tone="error">
            This link is missing its reset token. Request a new link below.
          </Notice>
          <button
            className={`${buttonClass} w-full`}
            onClick={() => navigate("/forgot")}
          >
            Request a reset link
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <Card title="Choose a new password">
        {done ? (
          <>
            <Notice tone="ok">
              Your password has been reset. The reset link can no longer be
              used.
            </Notice>
            <button
              className={`${buttonClass} w-full`}
              onClick={() => navigate("/login")}
            >
              Go to sign in
            </button>
          </>
        ) : (
          <>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <form onSubmit={submit}>
              <Field label="New password" hint="At least 8 characters.">
                <input
                  className={inputClass}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </Field>
              <Field label="Repeat new password">
                <input
                  className={inputClass}
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </Field>
              <button className={`${buttonClass} w-full`} disabled={busy}>
                {busy ? "Saving…" : "Set new password"}
              </button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
