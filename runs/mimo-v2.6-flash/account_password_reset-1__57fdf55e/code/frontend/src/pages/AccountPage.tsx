import { useState, type FormEvent } from "react";
import { api, apiError, type Account } from "../api";
import { Link } from "../router";
import {
  ErrorNotice,
  Field,
  Notice,
  PageTitle,
  buttonClass,
  cardClass,
} from "../ui";

function Profile({ account }: { account: Account }) {
  return (
    <div className={cardClass}>
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Profile</h2>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <dt className="text-slate-500">ID</dt>
        <dd className="col-span-2 text-slate-900">{account.id}</dd>
        <dt className="text-slate-500">Username</dt>
        <dd className="col-span-2 text-slate-900">{account.username}</dd>
        <dt className="text-slate-500">Email</dt>
        <dd className="col-span-2 text-slate-900">
          {account.email ?? "Not set"}
        </dd>
      </dl>
    </div>
  );
}

function EmailForm({
  account,
  onAccountUpdated,
}: {
  account: Account;
  onAccountUpdated: (account: Account) => void;
}) {
  const [email, setEmail] = useState(account.email ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const value = email.trim();
      const result = await api<Account>("/api/me", {
        method: "PATCH",
        body: { email: value ? value : null },
      });
      if (result.status === 200 && result.data) {
        onAccountUpdated(result.data);
        setMessage("Email updated.");
      } else {
        setError(apiError(result, "Could not update the email."));
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cardClass}>
      <h2 className="mb-4 text-lg font-semibold text-slate-900">
        Email address
      </h2>
      {message && <Notice>{message}</Notice>}
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <form onSubmit={submit} noValidate>
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
        />
        <p className="mb-4 text-xs text-slate-500">
          Leave empty to remove the address. Password resets need an address.
        </p>
        <button type="submit" className={buttonClass} disabled={busy}>
          {busy ? "Saving…" : "Save email"}
        </button>
      </form>
    </div>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (next.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (next !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await api("/api/me/password", {
        method: "POST",
        body: { current_password: current, new_password: next },
      });
      if (result.status === 200) {
        setCurrent("");
        setNext("");
        setConfirmation("");
        setMessage("Password changed.");
      } else {
        setError(apiError(result, "Could not change the password."));
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cardClass}>
      <h2 className="mb-4 text-lg font-semibold text-slate-900">
        Change password
      </h2>
      {message && <Notice>{message}</Notice>}
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <form onSubmit={submit} noValidate>
        <Field
          label="Current password"
          type="password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          autoComplete="current-password"
        />
        <Field
          label="New password"
          type="password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
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
        <button type="submit" className={buttonClass} disabled={busy}>
          {busy ? "Saving…" : "Change password"}
        </button>
      </form>
    </div>
  );
}

export default function AccountPage({
  account,
  onAccountUpdated,
}: {
  account: Account | null;
  onAccountUpdated: (account: Account) => void;
}) {
  if (!account) {
    return (
      <div className="mx-auto max-w-md">
        <PageTitle>Account</PageTitle>
        <div className={cardClass}>
          <p className="mb-4 text-sm text-slate-600">
            Sign in to view and edit your account.
          </p>
          <Link to="/login" className={buttonClass}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageTitle>Account</PageTitle>
      <div className="flex flex-col gap-6">
        <Profile account={account} />
        <EmailForm
          account={account}
          onAccountUpdated={onAccountUpdated}
        />
        <PasswordForm />
      </div>
    </div>
  );
}
