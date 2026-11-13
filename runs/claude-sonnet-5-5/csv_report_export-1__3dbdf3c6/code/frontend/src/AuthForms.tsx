import { FormEvent, useState } from "react";
import { api, ApiError, session } from "./api";

export const inputCls =
  "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
export const btnCls =
  "rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50";
export const btnSecondaryCls =
  "rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

export default function AuthForms({ onSignedIn }: { onSignedIn: (username: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage("");
    try {
      const name = username.trim();
      if (mode === "register") {
        await api.register(name, password);
      }
      const { token } = await api.login(name, password);
      session.set(token, name);
      onSignedIn(name);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        setMessage(Object.keys(err.errors).length ? "" : err.message);
      } else {
        setMessage("Network error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-lg bg-white p-6 shadow">
      <h1 className="mb-4 text-xl font-semibold text-slate-800">Timesheet</h1>
      <div className="mb-4 flex gap-2 text-sm">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setErrors({});
              setMessage("");
            }}
            className={`rounded px-3 py-1 ${mode === m ? "bg-indigo-100 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {m === "login" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Username</span>
          <input
            className={inputCls}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
          {errors.username && <span className="text-xs text-red-600">{errors.username}</span>}
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Password</span>
          <input
            className={inputCls}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
          {errors.password && <span className="text-xs text-red-600">{errors.password}</span>}
        </label>
        {message && <p className="text-sm text-red-600">{message}</p>}
        <button className={`${btnCls} w-full`} disabled={busy}>
          {mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
