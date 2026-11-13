import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiError } from "../api";
import { useAuth } from "../auth";
import { btnCls, ErrorBanner, Field, inputCls } from "../ui";

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { username: current, login, register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (current) return <Navigate to="/" replace />;

  const isLogin = mode === "login";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    try {
      if (isLogin) await login(username, password);
      else await register(username, password);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else setError("Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-4 rounded bg-white p-6 shadow">
      <h1 className="text-xl font-semibold">{isLogin ? "Sign in" : "Create account"}</h1>
      <ErrorBanner message={error} />
      <Field label="Username" htmlFor="username" error={isLogin ? undefined : fields.username}>
        <input
          id="username"
          className={inputCls}
          value={username}
          autoComplete="username"
          onChange={(e) => setUsername(e.target.value)}
        />
      </Field>
      <Field label="Password" htmlFor="password" error={isLogin ? undefined : fields.password}>
        <input
          id="password"
          type="password"
          className={inputCls}
          value={password}
          autoComplete={isLogin ? "current-password" : "new-password"}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <button type="submit" className={btnCls + " w-full"} disabled={busy}>
        {isLogin ? "Sign in" : "Register"}
      </button>
      <p className="text-sm text-slate-600">
        {isLogin ? (
          <>
            No account?{" "}
            <Link to="/register" className="text-indigo-700 hover:underline">
              Register
            </Link>
          </>
        ) : (
          <>
            Already registered?{" "}
            <Link to="/login" className="text-indigo-700 hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
