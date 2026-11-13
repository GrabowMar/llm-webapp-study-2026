import { useEffect, useState, type FormEvent } from "react";
import { api, getToken, type Account } from "../api";
import { Alert, Button, Card, Field } from "../components";
import { useAuth, useRouter } from "../context";
import { useApiMessage } from "../messages";

export default function AccountPage() {
  const { account, loading, refresh } = useAuth();
  const { navigate } = useRouter();
  const messageFor = useApiMessage();

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    if (!loading && !getToken()) navigate("/");
  }, [loading, navigate]);

  useEffect(() => {
    setEmail(account?.email ?? "");
  }, [account?.email]);

  async function saveEmail(event: FormEvent) {
    event.preventDefault();
    setEmailError(null);
    setEmailSaved(false);
    setEmailBusy(true);
    try {
      await api<Account>("/api/me", {
        method: "PATCH",
        body: { email: email.trim() === "" ? null : email.trim() },
      });
      await refresh();
      setEmailSaved(true);
    } catch (err) {
      setEmailError(messageFor(err));
    } finally {
      setEmailBusy(false);
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSaved(false);
    if (newPassword !== confirmPassword) {
      setPasswordError("The new passwords do not match.");
      return;
    }
    setPasswordBusy(true);
    try {
      await api("/api/me/password", {
        method: "POST",
        body: {
          current_password: currentPassword,
          new_password: newPassword,
        },
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(messageFor(err));
    } finally {
      setPasswordBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (!account) {
    return (
      <Card title="Not signed in" description="Sign in to manage your account.">
        <Button onClick={() => navigate("/")}>Go to sign in</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Your account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Signed in as{" "}
          <span className="font-semibold text-slate-900">
            {account.username}
          </span>
        </p>
      </div>

      <Card title="Profile" description="Your account details.">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
              ID
            </dt>
            <dd className="mt-1 text-sm text-slate-800">{account.id}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Username
            </dt>
            <dd className="mt-1 text-sm text-slate-800">{account.username}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Email address
            </dt>
            <dd className="mt-1 text-sm text-slate-800">
              {account.email ?? (
                <span className="text-slate-400">Not set</span>
              )}
            </dd>
          </div>
        </dl>
      </Card>

      <Card
        title="Edit email address"
        description="The address used for password reset links. Leave blank to remove it."
      >
        <form onSubmit={saveEmail} className="space-y-4">
          {emailError && <Alert kind="error">{emailError}</Alert>}
          {emailSaved && <Alert kind="success">Email address updated.</Alert>}
          <Field
            label="Email address"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <Button type="submit" disabled={emailBusy}>
            {emailBusy ? "Saving…" : "Save email"}
          </Button>
        </form>
      </Card>

      <Card title="Change password" description="Choose a new password.">
        <form onSubmit={savePassword} className="space-y-4">
          {passwordError && <Alert kind="error">{passwordError}</Alert>}
          {passwordSaved && (
            <Alert kind="success">Your password has been changed.</Alert>
          )}
          <Field
            label="Current password"
            name="current_password"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <Field
            label="New password"
            name="new_password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            hint="At least 8 characters."
          />
          <Field
            label="Confirm new password"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <Button type="submit" disabled={passwordBusy}>
            {passwordBusy ? "Changing…" : "Change password"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
