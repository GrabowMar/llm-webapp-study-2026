import { useState, type FormEvent } from "react";
import { api, ApiError, session } from "./api";
import { btn, ErrorMessage, Field, input } from "./ui";

export function AuthForm({
  mode,
  onSignedIn,
  onNavigate,
}: {
  mode: "login" | "register";
  onSignedIn: (username: string) => void;
  onNavigate: (path: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setFields({});
    setBusy(true);
    try {
      const name = username.trim();
      if (mode === "register") await api.register(name, password);
      const { token } = await api.login(name, password);
      session.set(token, name);
      onSignedIn(name);
      onNavigate("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields);
        setError(Object.keys(err.fields).length ? "" : err.message);
      } else {
        setError("Network error");
      }
    } finally {
      setBusy(false);
    }
  }

  const register = mode === "register";
  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-4 rounded bg-white p-6 shadow">
      <h1 className="text-xl font-semibold">{register ? "Create account" : "Sign in"}</h1>
      <ErrorMessage>{error}</ErrorMessage>
      <Field label="Username" error={fields.username}>
        <input
          className={input}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />
      </Field>
      <Field label="Password" error={fields.password}>
        <input
          className={input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={register ? "new-password" : "current-password"}
          required
        />
      </Field>
      <button className={btn} disabled={busy}>
        {register ? "Register" : "Sign in"}
      </button>
    </form>
  );
}
