import { useState, type FormEvent } from "react";
import { ApiError } from "../api";
import { useAuth } from "../auth";
import { Link, navigate } from "../router";
import { ErrorAlert, Field, buttonPrimaryClass, inputClass } from "../ui";

interface Props {
  mode: "login" | "register";
}

export default function AuthPage({ mode }: Props) {
  const { signIn, register } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const isLogin = mode === "login";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      if (isLogin) {
        await signIn(username, password);
      } else {
        await register(username, password);
      }
      navigate("/incidents");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">
          {isLogin ? "Sign in" : "Create an account"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isLogin
            ? "Sign in to open and update incidents."
            : "Register to join the operations team."}
        </p>

        <div className="mt-4">
          <ErrorAlert message={error} />
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
          <Field label="Username" error={fieldErrors.username}>
            <input
              className={inputClass}
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </Field>
          <Field label="Password" error={fieldErrors.password}>
            <input
              className={inputClass}
              type="password"
              name="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>
          <button type="submit" className={buttonPrimaryClass} disabled={busy}>
            {busy ? "Please wait…" : isLogin ? "Sign in" : "Register"}
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-500">
          {isLogin ? (
            <>
              No account yet?{" "}
              <Link to="/register" className="font-semibold text-blue-600 hover:text-blue-800">
                Register
              </Link>
            </>
          ) : (
            <>
              Already registered?{" "}
              <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-800">
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
