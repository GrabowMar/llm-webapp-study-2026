import { useState, type FormEvent } from "react";
import { api, setToken, type Account } from "../api";
import { Alert, Button, Card, Field, LinkButton } from "../components";
import { useAuth, useRouter } from "../context";
import { useApiMessage } from "../messages";

type Mode = "login" | "register" | "forgot";

function LoginForm({ onSwitch }: { onSwitch: (mode: Mode) => void }) {
  const { signIn } = useAuth();
  const { navigate } = useRouter();
  const messageFor = useApiMessage();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { token } = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: { username, password },
      });
      setToken(token);
      const account = await api<Account>("/api/me");
      signIn(token, account);
      navigate("/account");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Sign in" description="Welcome back. Sign in to your account.">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        <Field
          label="Username"
          name="username"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <div className="flex items-center gap-4">
            <LinkButton onClick={() => onSwitch("register")}>
              Create an account
            </LinkButton>
            <LinkButton onClick={() => onSwitch("forgot")}>
              Forgot password?
            </LinkButton>
          </div>
        </div>
      </form>
    </Card>
  );
}

function RegisterForm({ onSwitch }: { onSwitch: (mode: Mode) => void }) {
  const { signIn } = useAuth();
  const { navigate } = useRouter();
  const messageFor = useApiMessage();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api<Account>("/api/auth/register", {
        method: "POST",
        body: {
          username,
          password,
          email: email.trim() === "" ? null : email,
        },
      });
      const { token } = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: { username, password },
      });
      setToken(token);
      const account = await api<Account>("/api/me");
      signIn(token, account);
      navigate("/account");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Create an account"
      description="Passwords need at least 8 characters."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        <Field
          label="Username"
          name="username"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Field
          label="Email (optional)"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          hint="Used to receive password reset links."
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </Button>
          <LinkButton onClick={() => onSwitch("login")}>
            I already have an account
          </LinkButton>
        </div>
      </form>
    </Card>
  );
}

function ForgotForm({ onSwitch }: { onSwitch: (mode: Mode) => void }) {
  const messageFor = useApiMessage();
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const trimmed = identifier.trim();
      const body = trimmed.includes("@")
        ? { email: trimmed }
        : { username: trimmed };
      await api("/api/auth/password-reset", { method: "POST", body });
      setSent(true);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Forgot password?"
      description="Enter your username or email address and we'll send a reset link if the account exists."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {sent ? (
          <Alert kind="success">
            If the account exists, a reset link is on its way
          </Alert>
        ) : (
          error && <Alert kind="error">{error}</Alert>
        )}
        <Field
          label="Username or email"
          name="identifier"
          autoComplete="username"
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </Button>
          <LinkButton onClick={() => onSwitch("login")}>Back to sign in</LinkButton>
        </div>
      </form>
    </Card>
  );
}

export default function HomePage() {
  const { account, loading } = useAuth();
  const { navigate } = useRouter();
  const [mode, setMode] = useState<Mode>("login");

  if (loading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (account) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">
            Hello, {account.username}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            You are signed in. Manage your account or check the mailbox.
          </p>
          <div className="mt-4 flex gap-3">
            <Button onClick={() => navigate("/account")}>Manage account</Button>
            <Button variant="secondary" onClick={() => navigate("/mailbox")}>
              Open mailbox
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      {mode === "login" && <LoginForm onSwitch={setMode} />}
      {mode === "register" && <RegisterForm onSwitch={setMode} />}
      {mode === "forgot" && <ForgotForm onSwitch={setMode} />}
    </div>
  );
}
