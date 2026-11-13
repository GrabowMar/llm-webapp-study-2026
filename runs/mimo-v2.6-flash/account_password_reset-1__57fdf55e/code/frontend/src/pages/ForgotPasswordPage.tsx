import { useState, type FormEvent } from "react";
import { api } from "../api";
import { Link } from "../router";
import {
  ErrorNotice,
  Field,
  PageTitle,
  buttonClass,
  cardClass,
} from "../ui";

const GENERIC_MESSAGE = "If the account exists, a reset link is on its way";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!identifier.trim()) {
      setError("Enter your username or email address.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/password-reset", {
        method: "POST",
        body: { username: identifier.trim() },
      });
      setMessage(GENERIC_MESSAGE);
    } catch {
      setMessage(GENERIC_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <PageTitle>Forgot password?</PageTitle>
      <div className={cardClass}>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        {message && (
          <div className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            {message}
          </div>
        )}
        <form onSubmit={submit} noValidate>
          <Field
            label="Username or email"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="you@example.com"
          />
          <button
            type="submit"
            className={`${buttonClass} w-full`}
            disabled={busy}
          >
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
        <p className="mt-4 text-sm text-slate-600">
          The link arrives in the{" "}
          <Link to="/mailbox" className="text-sky-700 hover:underline">
            Mailbox
          </Link>{" "}
          page.
        </p>
      </div>
    </div>
  );
}
