import { useState, type FormEvent } from "react";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { Link, navigate } from "../router";
import { ErrorBanner, Field, inputClass, primaryButton } from "../ui";

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { login } = useAuth();
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
      if (!isLogin) await api.register(username, password);
      await login(username, password);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
        setError(Object.keys(err.fieldErrors).length ? null : err.message);
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm">
      <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-2xl font-semibold text-stone-900">
          {isLogin ? "Sign in" : "Create an account"}
        </h1>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <ErrorBanner message={error} />
          <Field label="Username" htmlFor="username" error={fieldErrors.username}>
            <input
              id="username"
              name="username"
              autoComplete="username"
              className={inputClass}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </Field>
          <Field label="Password" htmlFor="password" error={fieldErrors.password}>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <button type="submit" className={`${primaryButton} w-full`} disabled={busy}>
            {busy ? "Please wait…" : isLogin ? "Sign in" : "Register"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-stone-600">
          {isLogin ? (
            <>
              No account yet?{" "}
              <Link to="/register" className="font-medium text-amber-700 hover:underline">
                Register
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link to="/login" className="font-medium text-amber-700 hover:underline">
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
