import { useState, type FormEvent } from "react";
import { api, ApiError, type Session } from "./api";
import { Alert, Card, Field, inputClass, primaryButton } from "./ui";

export function AuthPanel({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register(username.trim(), password);
      }
      const session = await api.login(username.trim(), password);
      onSignedIn(session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      if (mode === "register" && err instanceof ApiError && err.status === 401) {
        setNotice("Account created. Please sign in.");
        setMode("login");
      }
    } finally {
      setBusy(false);
    }
  }

  const tab = (m: "login" | "register", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => {
        setMode(m);
        setError(null);
        setNotice(null);
      }}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
        mode === m ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900"
      }`}
    >
      {label}
    </button>
  );

  return (
    <Card title={mode === "login" ? "Sign in" : "Create an account"}>
      <div role="tablist" className="mb-4 flex gap-1 rounded-lg bg-stone-100 p-1">
        {tab("login", "Sign in")}
        {tab("register", "Register")}
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <Field label="Username" htmlFor="auth-username">
          <input
            id="auth-username"
            name="username"
            className={inputClass}
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </Field>
        <Field
          label="Password"
          htmlFor="auth-password"
          hint={mode === "register" ? "At least 8 characters." : undefined}
        >
          <input
            id="auth-password"
            name="password"
            type="password"
            className={inputClass}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        {notice && <Alert kind="info">{notice}</Alert>}
        {error && <Alert kind="error">{error}</Alert>}
        <button type="submit" className={primaryButton} disabled={busy || !username.trim() || !password}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
    </Card>
  );
}
