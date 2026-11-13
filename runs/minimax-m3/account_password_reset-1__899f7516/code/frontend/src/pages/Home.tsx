import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../api";
import { useAuth } from "../auth";
import { Button, Card, Notice, TextField } from "../ui";

export default function Home() {
  const { account, loading, signIn } = useAuth();
  const navigate = useNavigate();

  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regError, setRegError] = useState("");
  const [regDone, setRegDone] = useState(false);
  const [regBusy, setRegBusy] = useState(false);

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  async function onRegister(event: FormEvent) {
    event.preventDefault();
    setRegError("");
    setRegDone(false);
    setRegBusy(true);
    try {
      await register(regUsername.trim(), regPassword, regEmail.trim());
      setRegDone(true);
      setRegPassword("");
      setLoginUsername(regUsername.trim());
    } catch (error) {
      setRegError(error instanceof Error ? error.message : "Could not create the account");
    } finally {
      setRegBusy(false);
    }
  }

  async function onSignIn(event: FormEvent) {
    event.preventDefault();
    setLoginError("");
    setLoginBusy(true);
    try {
      await signIn(loginUsername.trim(), loginPassword);
      navigate("/account");
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : "Could not sign in",
      );
    } finally {
      setLoginBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (account) {
    return (
      <div className="space-y-6">
        <Card
          title={`Hello, ${account.username}`}
          description="You are signed in. Manage your account or read your messages."
        >
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => navigate("/account")}>Account settings</Button>
            <Button variant="secondary" onClick={() => navigate("/mailbox")}>
              Mailbox
            </Button>
          </div>
        </Card>
        <p className="text-sm text-slate-500">
          Need to change your password?{" "}
          <Link
            to="/forgot-password"
            className="font-medium text-indigo-600 underline-offset-2 hover:underline"
          >
            Forgot your password?
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card
        title="Create an account"
        description="Pick a username and a password of at least 8 characters. An email address is optional, but it is needed to reset a forgotten password."
      >
        <form className="space-y-4" onSubmit={onRegister}>
          <TextField
            id="register-username"
            label="Username"
            value={regUsername}
            onChange={setRegUsername}
            autoComplete="username"
            required
          />
          <TextField
            id="register-email"
            label="Email address (optional)"
            type="email"
            value={regEmail}
            onChange={setRegEmail}
            autoComplete="email"
            placeholder="you@example.com"
          />
          <TextField
            id="register-password"
            label="Password"
            type="password"
            value={regPassword}
            onChange={setRegPassword}
            autoComplete="new-password"
            required
            hint="At least 8 characters."
          />
          {regError ? <Notice tone="error">{regError}</Notice> : null}
          {regDone ? (
            <Notice tone="success">
              The account was created. Sign in with your new credentials.
            </Notice>
          ) : null}
          <Button disabled={regBusy}>
            {regBusy ? "Creating…" : "Create account"}
          </Button>
        </form>
      </Card>

      <Card title="Sign in" description="Use your username and password.">
        <form className="space-y-4" onSubmit={onSignIn}>
          <TextField
            id="login-username"
            label="Username"
            value={loginUsername}
            onChange={setLoginUsername}
            autoComplete="username"
            required
          />
          <TextField
            id="login-password"
            label="Password"
            type="password"
            value={loginPassword}
            onChange={setLoginPassword}
            autoComplete="current-password"
            required
          />
          {loginError ? <Notice tone="error">{loginError}</Notice> : null}
          <Button disabled={loginBusy}>{loginBusy ? "Signing in…" : "Sign in"}</Button>
        </form>
        <p className="mt-4 text-sm text-slate-500">
          <Link
            to="/forgot-password"
            className="font-medium text-indigo-600 underline-offset-2 hover:underline"
          >
            Forgot your password?
          </Link>
        </p>
      </Card>
    </div>
  );
}
