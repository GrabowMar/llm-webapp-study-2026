import { useState, type FormEvent } from "react";
import { api, type Session } from "./api";
import { btnCls, ErrorMsg, Field, inputCls, Panel } from "./ui";

export default function AuthForms({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await api("/auth/register", { method: "POST", body: { username, password } });
      }
      const res = await api<{ token: string; username?: string }>("/auth/login", {
        method: "POST",
        body: { username, password },
      });
      onSignedIn({ token: res.token, username: res.username ?? username.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const isLogin = mode === "login";
  return (
    <Panel title={isLogin ? "Sign in" : "Create account"}>
      <form onSubmit={submit} className="space-y-3">
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
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
          />
        </Field>
        <ErrorMsg message={error} />
        <div className="flex items-center gap-3">
          <button className={btnCls} disabled={busy} type="submit">
            {isLogin ? "Sign in" : "Register"}
          </button>
          <button
            type="button"
            className="text-sm text-blue-700 hover:underline"
            onClick={() => {
              setMode(isLogin ? "register" : "login");
              setError(null);
            }}
          >
            {isLogin ? "Need an account? Register" : "Have an account? Sign in"}
          </button>
        </div>
      </form>
    </Panel>
  );
}
