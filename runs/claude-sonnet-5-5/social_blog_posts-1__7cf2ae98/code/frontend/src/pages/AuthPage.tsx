import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { Button, ErrorBox, Field } from "../ui";

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    try {
      if (!isLogin) await api.register(username, password);
      await signIn(username, password);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields);
        setError(Object.keys(err.fields).length ? "" : err.message);
      } else setError("Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-4 rounded bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold">{isLogin ? "Sign in" : "Create account"}</h1>
      {error && <ErrorBox>{error}</ErrorBox>}
      <Field
        label="Username"
        name="username"
        autoComplete="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        error={fields.username}
        required
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete={isLogin ? "current-password" : "new-password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fields.password}
        required
      />
      <Button type="submit" disabled={busy} className="w-full">
        {isLogin ? "Sign in" : "Register"}
      </Button>
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
