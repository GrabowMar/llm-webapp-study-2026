import { useState } from "react";
import type { FormEvent } from "react";
import type { Account } from "../api";
import { api } from "../api";
import { navigate } from "../router";
import {
  Card,
  Field,
  Notice,
  buttonClass,
  inputClass,
} from "../components/ui";

export default function AccountPage({
  user,
  onUserChanged,
}: {
  user: Account | null;
  onUserChanged: (user: Account) => void;
}) {
  const [email, setEmail] = useState(user?.email ?? "");
  const [emailNotice, setEmailNotice] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [passwordNotice, setPasswordNotice] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  if (!user) {
    return (
      <div className="mx-auto max-w-md">
        <Card title="Account">
          <Notice tone="info">Sign in to see your account.</Notice>
          <button
            className={`${buttonClass} w-full`}
            onClick={() => navigate("/login")}
          >
            Go to sign in
          </button>
        </Card>
      </div>
    );
  }

  async function saveEmail(event: FormEvent) {
    event.preventDefault();
    setEmailNotice(null);
    setEmailBusy(true);
    try {
      const updated = await api<Account>("/api/me", {
        method: "PATCH",
        body: { email: email.trim() === "" ? null : email.trim() },
      });
      onUserChanged(updated);
      setEmailNotice({ tone: "ok", text: "Email address updated." });
    } catch (err) {
      setEmailNotice({
        tone: "error",
        text: err instanceof Error ? err.message : "Update failed",
      });
    } finally {
      setEmailBusy(false);
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordNotice(null);
    if (next.length < 8) {
      setPasswordNotice({
        tone: "error",
        text: "New password must be at least 8 characters",
      });
      return;
    }
    setPasswordBusy(true);
    try {
      await api("/api/me/password", {
        method: "POST",
        body: { current_password: current, new_password: next },
      });
      setCurrent("");
      setNext("");
      setPasswordNotice({ tone: "ok", text: "Password changed." });
    } catch (err) {
      setPasswordNotice({
        tone: "error",
        text: err instanceof Error ? err.message : "Change failed",
      });
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-2">
      <div className="md:col-span-2">
        <Card title="Account">
          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt className="font-medium text-slate-500">Username</dt>
            <dd className="col-span-2 text-slate-900">{user.username}</dd>
            <dt className="font-medium text-slate-500">Email</dt>
            <dd className="col-span-2 text-slate-900">
              {user.email ?? (
                <span className="text-slate-400">none on file</span>
              )}
            </dd>
          </dl>
        </Card>
      </div>

      <Card title="Change email">
        {emailNotice ? (
          <Notice tone={emailNotice.tone}>{emailNotice.text}</Notice>
        ) : null}
        <form onSubmit={saveEmail}>
          <Field
            label="Email address"
            hint="Used to receive password reset links."
          >
            <input
              className={inputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <button className={`${buttonClass} w-full`} disabled={emailBusy}>
            {emailBusy ? "Saving…" : "Save email"}
          </button>
        </form>
      </Card>

      <Card title="Change password">
        {passwordNotice ? (
          <Notice tone={passwordNotice.tone}>{passwordNotice.text}</Notice>
        ) : null}
        <form onSubmit={savePassword}>
          <Field label="Current password">
            <input
              className={inputClass}
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <input
              className={inputClass}
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>
          <button className={`${buttonClass} w-full`} disabled={passwordBusy}>
            {passwordBusy ? "Saving…" : "Change password"}
          </button>
        </form>
      </Card>
    </div>
  );
}
