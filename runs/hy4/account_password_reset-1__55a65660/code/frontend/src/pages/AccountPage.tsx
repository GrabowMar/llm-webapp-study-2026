import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api";
import { useAuth } from "../auth";
import { Alert, Button, Card, Field, TextInput } from "../components";

export default function AccountPage() {
  const { account, updateAccount, refresh } = useAuth();
  const [email, setEmail] = useState(account?.email ?? "");
  const [emailNotice, setEmailNotice] = useState("");
  const [emailError, setEmailError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    setEmail(account?.email ?? "");
  }, [account?.email]);

  if (!account) {
    return (
      <div className="flex flex-col items-center gap-4">
        <Card title="Sign in required" subtitle="View your account details.">
          <Link to="/auth">
            <Button className="w-full">Sign in</Button>
          </Link>
        </Card>
      </div>
    );
  }

  async function saveEmail(event: FormEvent) {
    event.preventDefault();
    setEmailError("");
    setEmailNotice("");
    setBusy("email");
    try {
      const updated = await api.updateEmail(email.trim() || null);
      updateAccount(updated);
      setEmail(updated.email ?? "");
      setEmailNotice("Email address updated.");
    } catch (err) {
      setEmailError(errorMessage(err));
      await refresh();
    } finally {
      setBusy("");
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError("");
    setPasswordNotice("");
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }
    setBusy("password");
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordNotice("Password changed.");
    } catch (err) {
      setPasswordError(errorMessage(err));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Your account
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Signed in as{" "}
          <span className="font-semibold text-slate-700">
            {account.username}
          </span>{" "}
          (ID {account.id}).
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Email address</h2>
        <p className="mt-1 text-sm text-slate-500">
          Current:{" "}
          {account.email ? (
            <span className="font-medium text-slate-800">{account.email}</span>
          ) : (
            <span className="italic text-slate-400">none</span>
          )}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          An account without an email address cannot reset its password.
        </p>
        <form onSubmit={saveEmail} className="mt-4 space-y-4">
          <Field label="Edit email">
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          {emailError && <Alert tone="error">{emailError}</Alert>}
          {emailNotice && <Alert tone="success">{emailNotice}</Alert>}
          <Button type="submit" disabled={busy === "email"}>
            {busy === "email" ? "Saving…" : "Save email"}
          </Button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Change password
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Use at least 8 characters for your new password.
        </p>
        <form onSubmit={savePassword} className="mt-4 space-y-4">
          <Field label="Current password">
            <TextInput
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="New password">
            <TextInput
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </Field>
          {passwordError && <Alert tone="error">{passwordError}</Alert>}
          {passwordNotice && <Alert tone="success">{passwordNotice}</Alert>}
          <Button type="submit" disabled={busy === "password"}>
            {busy === "password" ? "Saving…" : "Change password"}
          </Button>
        </form>
      </section>

      <p className="text-center text-sm text-slate-500">
        Forgot your password?{" "}
        <Link
          to="/forgot-password"
          className="font-medium text-indigo-600 hover:underline"
        >
          Request a reset link
        </Link>
      </p>
    </div>
  );
}
