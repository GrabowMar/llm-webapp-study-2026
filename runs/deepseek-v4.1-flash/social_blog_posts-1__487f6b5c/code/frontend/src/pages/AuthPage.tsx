import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { useRouter } from "../router";
import { Alert, Button, Field, TextInput } from "../components/ui";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { signIn, register } = useAuth();
  const { navigate, search } = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isRegister) await register(username, password);
      else await signIn(username, password);
      const params = new URLSearchParams(search);
      const next = params.get("next");
      navigate(next && next.startsWith("/") ? next : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-bold">
        {isRegister ? "Create your account" : "Welcome back"}
      </h1>
      <form
        onSubmit={submit}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        {error && <Alert>{error}</Alert>}
        <Field label="Username">
          <TextInput
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            maxLength={50}
          />
        </Field>
        <Field label="Password">
          <TextInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? "new-password" : "current-password"}
            required
          />
        </Field>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Please wait…" : isRegister ? "Register" : "Sign in"}
        </Button>
        <p className="text-center text-sm text-slate-500">
          {isRegister ? "Already have an account? " : "No account yet? "}
          <button
            type="button"
            className="font-medium text-slate-900 underline"
            onClick={() =>
              navigate(isRegister ? "/login" : "/register")
            }
          >
            {isRegister ? "Sign in" : "Register"}
          </button>
        </p>
      </form>
    </div>
  );
}
