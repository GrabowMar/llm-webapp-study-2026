import { useState, type FormEvent } from "react";
import { api, ApiError, type Session } from "./api";

const input = "w-full rounded border border-slate-300 px-2 py-1.5 text-sm";
const btn =
  "rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50";

export default function AuthForms({ onSession }: { onSession: (s: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      if (mode === "register") {
        await api("POST", "/auth/register", { username, password });
      }
      const res = await api<Session & { token: string }>("POST", "/auth/login", {
        username,
        password,
      });
      onSession({ token: res.token, username: res.username ?? username, is_admin: !!res.is_admin });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mb-6 max-w-sm space-y-3 rounded-lg border bg-white p-4 shadow-sm"
    >
      <h2 className="text-lg font-semibold">
        {mode === "login" ? "Sign in" : "Create account"}
      </h2>
      <label className="block text-sm">
        Username
        <input
          className={input}
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </label>
      <label className="block text-sm">
        Password
        <input
          className={input}
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {info && <p className="text-sm text-green-700">{info}</p>}
      <div className="flex items-center gap-3">
        <button className={btn} disabled={busy} type="submit">
          {mode === "login" ? "Sign in" : "Register"}
        </button>
        <button
          type="button"
          className="text-sm text-slate-600 underline"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
        </button>
      </div>
    </form>
  );
}
