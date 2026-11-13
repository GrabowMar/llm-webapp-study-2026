import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { changePassword, updateEmail } from "../api";
import { useAuth } from "../auth";
import { Button, Card, Notice, TextField } from "../ui";

export default function Account() {
  const { account, loading, refresh } = useAuth();

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailDone, setEmailDone] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordDone, setPasswordDone] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    setEmail(account?.email ?? "");
  }, [account]);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (!account) {
    return (
      <Card title="Account">
        <Notice tone="error">You need to sign in to see your account.</Notice>
        <p className="mt-4 text-sm text-slate-500">
          <Link
            to="/"
            className="font-medium text-indigo-600 underline-offset-2 hover:underline"
          >
            Go to sign in
          </Link>
        </p>
      </Card>
    );
  }

  async function onEmailSubmit(event: FormEvent) {
    event.preventDefault();
    setEmailError("");
    setEmailDone(false);
    setEmailBusy(true);
    try {
      await updateEmail(email.trim());
      await refresh();
      setEmailDone(true);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Could not update the email");
    } finally {
      setEmailBusy(false);
    }
  }

  async function onPasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setPasswordError("");
    setPasswordDone(false);
    if (newPassword !== repeatPassword) {
      setPasswordError("The two passwords do not match.");
      return;
    }
    setPasswordBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setRepeatPassword("");
      setPasswordDone(true);
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : "Could not change the password",
      );
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card
        title="Your account"
        description={`Signed in as ${account.username}.`}
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-medium text-slate-500">Username</dt>
            <dd className="text-slate-900">{account.username}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Email address</dt>
            <dd className="text-slate-900">
              {account.email ?? "No email address on file"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Account id</dt>
            <dd className="text-slate-900">{account.id}</dd>
          </div>
        </dl>
      </Card>

      <Card
        title="Change your email address"
        description="The address is used to send password reset links. It has to be unique."
      >
        <form className="space-y-4" onSubmit={onEmailSubmit}>
          <TextField
            id="account-email"
            label="Email address"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            placeholder="you@example.com"
            hint="Leave the field empty to remove the address from the account."
          />
          {emailError ? <Notice tone="error">{emailError}</Notice> : null}
          {emailDone ? (
            <Notice tone="success">The email address was saved.</Notice>
          ) : null}
          <Button disabled={emailBusy}>
            {emailBusy ? "Saving…" : "Save email address"}
          </Button>
        </form>
      </Card>

      <Card
        title="Change your password"
        description="You need your current password to set a new one."
      >
        <form className="space-y-4" onSubmit={onPasswordSubmit}>
          <TextField
            id="current-password"
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
            required
          />
          <TextField
            id="account-new-password"
            label="New password"
            type="password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            required
            hint="At least 8 characters."
          />
          <TextField
            id="account-repeat-password"
            label="Repeat new password"
            type="password"
            value={repeatPassword}
            onChange={setRepeatPassword}
            autoComplete="new-password"
            required
          />
          {passwordError ? <Notice tone="error">{passwordError}</Notice> : null}
          {passwordDone ? (
            <Notice tone="success">Your password was changed.</Notice>
          ) : null}
          <Button disabled={passwordBusy}>
            {passwordBusy ? "Saving…" : "Change password"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
