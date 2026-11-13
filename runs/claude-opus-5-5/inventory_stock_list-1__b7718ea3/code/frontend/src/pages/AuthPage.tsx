import { useState, type FormEvent } from "react";
import { ApiError } from "../api";
import { useAuth } from "../auth";
import { Link, navigate } from "../router";
import { Alert, Button, Card, Field, Input } from "../components/ui";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      if (isLogin) await login(username, password);
      else await register(username, password);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors);
      } else {
        setError("Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm pt-8">
      <Card className="p-6">
        <h1 className="mb-1 text-xl font-bold">{isLogin ? "Sign in" : "Create an account"}</h1>
        <p className="mb-5 text-sm text-slate-500">
          {isLogin ? "Sign in to manage items and record stock." : "Register to manage items and record stock."}
        </p>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert>{error}</Alert>}
          <Field label="Username" htmlFor="username" error={fieldErrors.username}>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              invalid={!!fieldErrors.username}
              autoFocus
            />
          </Field>
          <Field label="Password" htmlFor="password" error={fieldErrors.password}>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              invalid={!!fieldErrors.password}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : isLogin ? "Sign in" : "Register"}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-600">
          {isLogin ? (
            <>
              No account?{" "}
              <Link href="/register" className="font-medium text-indigo-600 hover:underline">
                Register
              </Link>
            </>
          ) : (
            <>
              Already registered?{" "}
              <Link href="/login" className="font-medium text-indigo-600 hover:underline">
                Sign in
              </Link>
            </>
          )}
        </p>
      </Card>
    </div>
  );
}
