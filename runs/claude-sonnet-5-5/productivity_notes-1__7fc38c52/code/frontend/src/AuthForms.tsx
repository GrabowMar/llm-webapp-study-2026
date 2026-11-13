import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "./api";
import { useAuth } from "./auth";
import { btn, card, input, label } from "./ui";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
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
      await (isLogin ? login : register)(username, password);
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
    <form onSubmit={submit} className={`${card} mx-auto max-w-sm space-y-4`}>
      <h1 className="text-xl font-semibold">{isLogin ? "Sign in" : "Create account"}</h1>
      {error && (
        <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div>
        <label htmlFor="username" className={label}>
          Username
        </label>
        <input
          id="username"
          name="username"
          className={input}
          value={username}
          autoComplete="username"
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        {fields.username && <p className="mt-1 text-sm text-red-600">{fields.username}</p>}
      </div>
      <div>
        <label htmlFor="password" className={label}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className={input}
          value={password}
          autoComplete={isLogin ? "current-password" : "new-password"}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {fields.password && <p className="mt-1 text-sm text-red-600">{fields.password}</p>}
      </div>
      <button className={btn} disabled={busy}>
        {isLogin ? "Sign in" : "Register"}
      </button>
      <p className="text-sm text-slate-600">
        {isLogin ? (
          <>
            No account?{" "}
            <Link className="text-indigo-600 underline" to="/register">
              Register
            </Link>
          </>
        ) : (
          <>
            Already registered?{" "}
            <Link className="text-indigo-600 underline" to="/login">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
