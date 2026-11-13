import { useState, type FormEvent } from "react";
import { api, ApiError, setSession } from "./api";
import { navigate } from "./router";
import { btnCls, ErrorBox, Field, inputCls } from "./ui";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      if (!isLogin) await api.register(username, password);
      const { token } = await api.login(username, password);
      setSession(token, username.trim());
      navigate("/incidents");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else {
        setError("Unexpected error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-2xl font-semibold">{isLogin ? "Sign in" : "Create account"}</h1>
      <form onSubmit={submit} className="space-y-4 rounded-lg bg-white p-5 shadow">
        {error && <ErrorBox>{error}</ErrorBox>}
        <Field label="Username" error={fields.username}>
          <input
            className={inputCls}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </Field>
        <Field label="Password" error={fields.password}>
          <input
            className={inputCls}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
          />
        </Field>
        <button className={`${btnCls} w-full`} disabled={busy}>
          {isLogin ? "Sign in" : "Register"}
        </button>
      </form>
    </div>
  );
}
