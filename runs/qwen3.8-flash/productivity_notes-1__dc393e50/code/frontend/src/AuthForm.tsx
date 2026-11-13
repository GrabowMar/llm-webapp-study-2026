import { useState } from "react";
import type { Session } from "./api";
import { api, ApiError, flattenFieldErrors } from "./api";

export default function AuthForm({
  onSession,
  authors,
}: {
  onSession: (s: Session) => void;
  authors: string[];
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      if (mode === "register") {
        await api.register(username, password);
      }
      const { token } = await api.login(username, password);
      onSession({ token, username: username.trim() });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors([err.message, ...flattenFieldErrors(err.fieldErrors)]);
      } else {
        setErrors(["Network error, please try again."]);
      }
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200";

  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="mb-6 flex rounded-lg bg-slate-100 p-1">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setErrors([]);
            }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium capitalize transition ${
              mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {m === "login" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-700">
            Username
          </label>
          <input
            id="username"
            className={input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            list={mode === "login" ? "known-authors" : undefined}
            required
            autoComplete="username"
          />
          {mode === "login" && (
            <datalist id="known-authors">
              {authors.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          )}
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            className={input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </div>
        {mode === "register" && (
          <p className="text-xs text-slate-500">3–64 characters for the username; at least 8 for the password.</p>
        )}
        {errors.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
