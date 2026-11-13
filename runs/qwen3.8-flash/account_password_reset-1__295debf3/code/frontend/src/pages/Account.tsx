import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, changePassword, updateEmail } from "../api";
import { useAuth } from "../auth";
import { Alert, Button, Card, Field, Heading } from "../ui";

export default function Account() {
  const { user, refresh, signOut } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState(user?.email ?? "");
  const [emailMsg, setEmailMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pwMsg, setPwMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  if (!user) return null;

  async function saveEmail(e: FormEvent) {
    e.preventDefault();
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      await updateEmail(email.trim() || null);
      await refresh();
      setEmailMsg({ kind: "success", text: "Email updated" });
    } catch (err) {
      setEmailMsg({
        kind: "error",
        text: err instanceof ApiError ? err.message : "Something went wrong",
      });
    } finally {
      setEmailBusy(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    setPwMsg(null);
    try {
      await changePassword(current, next);
      setPwMsg({ kind: "success", text: "Password changed" });
      setCurrent("");
      setNext("");
    } catch (err) {
      setPwMsg({
        kind: "error",
        text: err instanceof ApiError ? err.message : "Something went wrong",
      });
    } finally {
      setPwBusy(false);
    }
  }

  function onSignOut() {
    signOut();
    navigate("/login");
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <Card>
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className="truncate text-lg font-semibold text-slate-900">
            {user.username}
            <span className="ml-2 align-middle text-sm font-normal text-slate-500">#{user.id}</span>
          </p>
          <Button variant="danger" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
        <form onSubmit={saveEmail} className="space-y-4">
          {emailMsg && <Alert kind={emailMsg.kind}>{emailMsg.text}</Alert>}
          <Field
            label="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <Button type="submit" disabled={emailBusy}>
            {emailBusy ? "Saving…" : "Save email"}
          </Button>
        </form>
      </Card>

      <Card>
        <Heading>Change password</Heading>
        <form onSubmit={savePassword} className="space-y-4">
          {pwMsg && <Alert kind={pwMsg.kind}>{pwMsg.text}</Alert>}
          <Field
            label="Current password"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
          <Field
            label="New password"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={8}
          />
          <Button type="submit" disabled={pwBusy}>
            {pwBusy ? "Saving…" : "Change password"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
