import { FormEvent, useState } from "react";
import { api, ApiError } from "./api";

export const inputClass =
  "w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
export const buttonClass =
  "rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50";

export function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="mt-1 text-xs text-red-600">
      {message}
    </p>
  ) : null;
}

export default function AuthForm({ onSignedIn }: { onSignedIn: (token: string, username: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    try {
      const name = username.trim();
      if (mode === "register") await api.register(name, password);
      const { token } = await api.login(name, password);
      onSignedIn(token, name);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(Object.keys(err.fields).length ? "" : err.message);
        setFields(err.fields);
      } else {
        setError("Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-start gap-2" aria-label={mode === "login" ? "Sign in" : "Register"}>
      <div>
        <input
          className={inputClass + " w-40"}
          placeholder="Username"
          aria-label="Username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <FieldError message={fields.username} />
      </div>
      <div>
        <input
          className={inputClass + " w-40"}
          type="password"
          placeholder="Password"
          aria-label="Password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FieldError message={fields.password} />
      </div>
      <button className={buttonClass} disabled={busy} type="submit">
        {mode === "login" ? "Sign in" : "Register"}
      </button>
      <button
        type="button"
        className="px-2 py-2 text-sm text-indigo-600 hover:underline"
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setError("");
          setFields({});
        }}
      >
        {mode === "login" ? "Create an account" : "Have an account? Sign in"}
      </button>
      <FieldError message={error} />
    </form>
  );
}
