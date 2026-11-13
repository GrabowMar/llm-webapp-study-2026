import { useState } from "react";
import type { FormEvent } from "react";
import { api, session } from "./api";
import { btnCls, Card, ErrorMsg, Field, inputCls } from "./ui";

export default function AuthForms({ onSignedIn }: { onSignedIn: (user: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const name = username.trim();
      if (mode === "register") {
        await api("POST", "/auth/register", { username: name, password });
      }
      const res = await api<{ token: string }>("POST", "/auth/login", { username: name, password });
      session.set(res.token, name);
      onSignedIn(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <Card title={mode === "login" ? "Sign in" : "Create account"}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Username">
            <input
              className={inputCls}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Password">
            <input
              className={inputCls}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </Field>
          <ErrorMsg message={error} />
          <button className={`${btnCls} w-full`} disabled={busy} type="submit">
            {mode === "login" ? "Sign in" : "Register"}
          </button>
        </form>
        <button
          type="button"
          className="mt-4 text-sm text-indigo-600 hover:underline"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
        >
          {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
        </button>
      </Card>
    </div>
  );
}
