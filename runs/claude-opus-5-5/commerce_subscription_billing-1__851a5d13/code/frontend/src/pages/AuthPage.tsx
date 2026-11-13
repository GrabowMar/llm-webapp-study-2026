import { useState } from "react";
import { api, errorMessage, session } from "../api";
import { navigate } from "../router";
import { Alert, Button, Card, Field, Input, Link } from "../ui";

export default function AuthPage({ mode, onSignedIn }: { mode: "login" | "register"; onSignedIn: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isRegister) {
        await api("/auth/register", { method: "POST", body: { username, password } });
      }
      const res = await api<{ token: string; username?: string }>("/auth/login", {
        method: "POST",
        body: { username, password },
      });
      const name = res.username ?? username.trim();
      session.set(res.token, name);
      onSignedIn(name);
      navigate("/subscriptions");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm py-10">
      <Card title={isRegister ? "Create an account" : "Sign in"}>
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Username">
            <Input
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={isRegister ? 3 : undefined}
              maxLength={64}
            />
          </Field>
          <Field label="Password">
            <Input
              name="password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={isRegister ? 8 : undefined}
            />
          </Field>
          {isRegister && <p className="text-xs text-slate-500">At least 8 characters.</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Please wait…" : isRegister ? "Register" : "Sign in"}
          </Button>
          <p className="text-center text-sm text-slate-600">
            {isRegister ? (
              <>
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-indigo-600 hover:underline">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                No account yet?{" "}
                <Link href="/register" className="font-medium text-indigo-600 hover:underline">
                  Register
                </Link>
              </>
            )}
          </p>
        </form>
      </Card>
    </div>
  );
}
