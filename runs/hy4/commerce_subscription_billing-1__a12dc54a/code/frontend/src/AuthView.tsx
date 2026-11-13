import { useState } from "react";
import { authApi, saveSession } from "./api";
import { ApiError } from "./api";
import { Alert, Button, Card, Field, inputClass } from "./components";

export default function AuthView({
  onSignedIn,
}: {
  onSignedIn: (username: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        await authApi.register(username.trim(), password);
        const result = await authApi.login(username.trim(), password);
        saveSession(result.token, result.username ?? username.trim());
        onSignedIn(result.username ?? username.trim());
      } else {
        const result = await authApi.login(username.trim(), password);
        saveSession(result.token, result.username ?? username.trim());
        onSignedIn(result.username ?? username.trim());
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: "login" | "register") {
    setMode(next);
    setError("");
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Billing Console
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Sign in to manage your team&apos;s subscriptions.
        </p>
      </div>
      <Card className="p-6">
        <div className="mb-6 flex rounded-lg bg-slate-100 p-1">
          {(["login", "register"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => switchMode(value)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
                mode === value
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {value === "login" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Username">
            <input
              className={inputClass}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
              placeholder="jane"
            />
          </Field>
          <Field label="Password">
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              placeholder="••••••••"
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
