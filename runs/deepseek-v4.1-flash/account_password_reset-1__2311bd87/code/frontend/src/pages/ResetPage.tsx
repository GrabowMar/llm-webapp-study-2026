import { useState, type FormEvent } from "react";
import { api } from "../api";
import { Alert, Button, Card, Field } from "../components";
import { useRouter } from "../context";
import { useApiMessage } from "../messages";

export default function ResetPage() {
  const { navigate } = useRouter();
  const messageFor = useApiMessage();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("The passwords do not match.");
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
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Card
        title="Reset password"
        description="This reset link is missing its token."
      >
        <Alert kind="error">
          Open the link from your mailbox to reset your password.
        </Alert>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate("/mailbox")}>
            Open mailbox
          </Button>
        </div>
      </Card>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg">
        <Card
          title="Password updated"
          description="Your password has been changed. You can now sign in."
        >
          <Button onClick={() => navigate("/")}>Go to sign in</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <Card
        title="Choose a new password"
        description="Enter your new password twice to confirm it."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert kind="error">{error}</Alert>}
          <Field
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="At least 8 characters."
          />
          <Field
            label="Confirm new password"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Set new password"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
