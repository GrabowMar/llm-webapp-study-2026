import { FormEvent, useState } from "react";
import { api, ApiError, session } from "./api";

interface Props {
  mode: "login" | "register";
  onModeChange: (m: "login" | "register") => void;
  onClose: () => void;
  onSignedIn: (username: string) => void;
}

export default function AuthForms({ mode, onModeChange, onClose, onSignedIn }: Props) {
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
      if (mode === "register") await api.register(username, password);
      const res = await api.login(username, password);
      session.set(res.token, res.username ?? username);
      onSignedIn(res.username ?? username);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else setError("Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded border border-slate-300 px-2 py-1.5";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={mode === "login" ? "Sign in" : "Register"}>
      <form onSubmit={submit} className="w-full max-w-sm rounded bg-white p-5 shadow-lg">
        <h2 className="mb-3 text-lg font-semibold">{mode === "login" ? "Sign in" : "Create account"}</h2>
        <label className="mb-3 block text-sm">
          Username
          <input
            name="username"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={input}
          />
          {fields.username && <span className="text-xs text-red-600">{fields.username}</span>}
        </label>
        <label className="mb-3 block text-sm">
          Password
          <input
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
          {fields.password && <span className="text-xs text-red-600">{fields.password}</span>}
        </label>
        {error && !fields.username && !fields.password && (
          <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>
        )}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onModeChange(mode === "login" ? "register" : "login")}
            className="text-sm text-blue-700 hover:underline"
          >
            {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
              Cancel
            </button>
            <button disabled={busy} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50">
              {mode === "login" ? "Sign in" : "Register"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
