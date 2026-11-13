import { useState, type FormEvent } from "react";
import { api, apiError } from "../api";
import { Link } from "../router";
import {
  ErrorNotice,
  Field,
  Notice,
  PageTitle,
  buttonClass,
  cardClass,
} from "../ui";

export default function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("token");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await api("/api/auth/password-reset/confirm", {
        method: "POST",
        body: { token, new_password: password },
      });
      if (result.status === 200) {
        setDone(true);
      } else {
        setError(apiError(result, "Could not reset the password."));
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="mx-auto max-w-md">
        <PageTitle>Reset password</PageTitle>
        <div className={cardClass}>
          <ErrorNotice>
            This reset link is missing its token. Request a new one.
          </ErrorNotice>
          <Link to="/forgot" className={buttonClass}>
            Request a reset link
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md">
        <PageTitle>Reset password</PageTitle>
        <div className={cardClass}>
          <Notice>Your password has been updated.</Notice>
          <Link to="/login" className={buttonClass}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <PageTitle>Choose a new password</PageTitle>
      <div className={cardClass}>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <form onSubmit={submit} noValidate>
          <Field
            label="New password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />
          <Field
            label="Repeat new password"
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="new-password"
          />
          <button
            type="submit"
            className={`${buttonClass} w-full`}
            disabled={busy}
          >
            {busy ? "Saving…" : "Set new password"}
          </button>
        </form>
      </div>
    </div>
  );
}
