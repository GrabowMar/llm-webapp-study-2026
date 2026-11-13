import { useState, type FormEvent } from "react";
import { api, errorFields, errorMessage, HttpError } from "./api";

interface AuthPanelProps {
  onSignedIn: (token: string, username: string) => void;
}

export default function AuthPanel({ onSignedIn }: AuthPanelProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    setFieldErrors({});
    setBusy(true);
    try {
      if (mode === "register") {
        const result = await api.register(username, password);
        onSignedIn(result.token, result.username);
      } else {
        const result = await api.login(username, password);
        onSignedIn(result.token, username.trim());
      }
      setPassword("");
    } catch (err) {
      setFieldErrors(errorFields(err));
      setFormError(errorMessage(err));
      if (err instanceof HttpError && err.status === 401) {
        setFieldErrors({ password: "Invalid username or password" });
      }
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: "login" | "register") {
    setMode(next);
    setFormError("");
    setFieldErrors({});
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl">
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-950/60 p-1">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
              mode === m
                ? "bg-violet-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {m === "login" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>
      <h2 className="mb-1 text-base font-semibold text-white">
        {mode === "login" ? "Welcome back" : "Create an account"}
      </h2>
      <p className="mb-4 text-xs text-slate-400">
        {mode === "login"
          ? "Sign in to add and manage your tracks."
          : "Register to start building your library."}
      </p>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <Field
          label="Username"
          value={username}
          onChange={setUsername}
          error={fieldErrors.username}
          autoComplete="username"
        />
        <Field
          label="Password"
          value={password}
          onChange={setPassword}
          error={fieldErrors.password}
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
        {formError && !Object.keys(fieldErrors).length && (
          <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {formError}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy
            ? "Please wait…"
            : mode === "login"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-300">{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border bg-slate-950/70 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:ring-2 focus:ring-violet-500/40 ${
          error ? "border-rose-500" : "border-slate-700 focus:border-violet-500"
        }`}
      />
      {error && <span className="mt-1 block text-xs text-rose-400">{error}</span>}
    </label>
  );
}
