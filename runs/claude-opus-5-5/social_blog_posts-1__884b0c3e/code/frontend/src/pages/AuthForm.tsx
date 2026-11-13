import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { Link, navigate } from "../router";
import { Alert, btnPrimary, Card, FieldError, inputCls } from "../ui";

export default function AuthForm({ mode, next }: { mode: "login" | "register"; next: string }) {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    setBusy(true);
    try {
      if (!isLogin) await api.register(username, password);
      await login(username, password);
      navigate(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors);
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h1 className="mb-6 text-2xl font-semibold text-slate-900">{isLogin ? "Sign in" : "Create an account"}</h1>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert>{error}</Alert>}
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              className={inputCls}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              aria-invalid={!!fieldErrors.username}
              aria-describedby={fieldErrors.username ? "username-error" : undefined}
              required
              autoFocus
            />
            <FieldError id="username-error" message={fieldErrors.username} />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
              required
            />
            <FieldError id="password-error" message={fieldErrors.password} />
          </div>
          <button type="submit" className={`${btnPrimary} w-full`} disabled={busy}>
            {busy ? "Please wait…" : isLogin ? "Sign in" : "Register"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-600">
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
