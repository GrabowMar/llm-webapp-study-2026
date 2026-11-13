import { useState, type FormEvent } from "react";
import { api, setToken } from "./api";
import { Card, ErrorMsg, Field, inputCls, primaryBtn } from "./ui";

export default function AuthForms({ onSignedIn }: { onSignedIn: () => void }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <LoginForm onSignedIn={onSignedIn} />
      <RegisterForm />
    </div>
  );
}

function LoginForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { token } = await api.login(username, password);
      setToken(token);
      onSignedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Sign in">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Username">
          <input
            className={inputCls}
            value={username}
            autoComplete="username"
            required
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <input
            className={inputCls}
            type="password"
            value={password}
            autoComplete="current-password"
            required
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorMsg message={error} />
        <button className={primaryBtn} disabled={busy}>
          Sign in
        </button>
      </form>
    </Card>
  );
}

function RegisterForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    setBusy(true);
    try {
      await api.register(username, password);
      setDone(true);
      setPassword("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Create an account">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Username">
          <input
            className={inputCls}
            value={username}
            autoComplete="username"
            required
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <input
            className={inputCls}
            type="password"
            value={password}
            autoComplete="new-password"
            required
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorMsg message={error} />
        {done && (
          <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            Account created. You can sign in now.
          </p>
        )}
        <button className={primaryBtn} disabled={busy}>
          Register
        </button>
      </form>
    </Card>
  );
}
