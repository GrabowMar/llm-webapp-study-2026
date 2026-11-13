import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { ErrorBox, Field, inputCls, primaryBtn } from "../ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const isRegister = mode === "register";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setFields({});
    setBusy(true);
    try {
      if (isRegister) await api.register(username, password);
      const res = await api.login(username.trim(), password);
      signIn(res.token, res.username);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields);
        setError(Object.keys(err.fields).length ? "" : err.message);
      } else {
        setError("Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-4 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold">{isRegister ? "Create an account" : "Sign in"}</h1>
      {error && <ErrorBox message={error} />}
      <Field label="Username" htmlFor="username" error={fields.username}>
        <input id="username" name="username" className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
      </Field>
      <Field label="Password" htmlFor="password" error={fields.password}>
        <input id="password" name="password" type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isRegister ? "new-password" : "current-password"} required />
      </Field>
      <button type="submit" className={`${primaryBtn} w-full`} disabled={busy}>
        {isRegister ? "Register" : "Sign in"}
      </button>
      <p className="text-sm text-stone-600">
        {isRegister ? (
          <>Already have an account? <Link className="text-amber-800 underline" to="/login">Sign in</Link></>
        ) : (
          <>No account yet? <Link className="text-amber-800 underline" to="/register">Register</Link></>
        )}
      </p>
    </form>
  );
}
