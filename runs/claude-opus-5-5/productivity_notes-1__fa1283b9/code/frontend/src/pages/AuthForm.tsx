import { useState, type FormEvent } from "react";
import { ApiError } from "../api";
import { useAuth } from "../auth";
import { Alert, FieldError, btnPrimary, inputCls } from "../components/ui";
import { Link, navigate } from "../router";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const auth = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      if (isLogin) await auth.login(username, password);
      else await auth.register(username, password);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.errors);
        if (!Object.keys(err.errors).length) setError(err.message);
      } else {
        setError((err as Error).message);
      }
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-2xl font-bold text-slate-900">{isLogin ? "Sign in" : "Create an account"}</h1>
      <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        {error && <Alert>{error}</Alert>}
        <div>
          <label htmlFor="auth-username" className="mb-1 block text-sm font-medium text-slate-700">
            Username
          </label>
          <input
            id="auth-username"
            name="username"
            autoComplete="username"
            className={inputCls}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-invalid={!!fieldErrors.username || undefined}
            autoFocus
          />
          <FieldError message={fieldErrors.username} />
        </div>
        <div>
          <label htmlFor="auth-password" className="mb-1 block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="auth-password"
            name="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            className={inputCls}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!fieldErrors.password || undefined}
          />
          <FieldError message={fieldErrors.password} />
        </div>
        <button type="submit" className={`${btnPrimary} w-full`} disabled={busy}>
          {busy ? "Please wait…" : isLogin ? "Sign in" : "Register"}
        </button>
        <p className="text-center text-sm text-slate-600">
          {isLogin ? (
            <>
              No account?{" "}
              <Link to="/register" className="font-medium text-indigo-600 hover:underline">
                Register
              </Link>
            </>
          ) : (
            <>
              Already registered?{" "}
              <Link to="/login" className="font-medium text-indigo-600 hover:underline">
                Sign in
              </Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
