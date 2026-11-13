import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError, login, register, toApiError } from "../api";

interface AuthProps {
  onSignedIn: (token: string, username: string) => void;
}

const inputClass =
  "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default function Auth({ onSignedIn }: AuthProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function switchMode(next: "login" | "register") {
    setMode(next);
    setMessage(null);
    setNotice(null);
    setFields({});
    setPassword("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setNotice(null);
    setFields({});
    try {
      if (mode === "register") {
        await register(username, password);
        setPassword("");
        setMode("login");
        setNotice("Account created. Please sign in.");
      } else {
        const { token } = await login(username, password);
        onSignedIn(token, username.trim());
      }
    } catch (err) {
      const apiError: ApiError = toApiError(err);
      setMessage(apiError.message);
      setFields(apiError.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex rounded border border-slate-200 p-1">
        <button
          type="button"
          onClick={() => switchMode("login")}
          className={`flex-1 rounded px-3 py-2 text-sm font-medium ${
            mode === "login" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => switchMode("register")}
          className={`flex-1 rounded px-3 py-2 text-sm font-medium ${
            mode === "register" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Register
        </button>
      </div>

      <h2 className="mb-3 text-lg font-semibold text-slate-800">
        {mode === "login" ? "Sign in to your account" : "Create an account"}
      </h2>

      {notice && <p className="mb-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
      {message && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="auth-username" className="block text-sm font-medium text-slate-700">
            Username
          </label>
          <input
            id="auth-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputClass}
            autoComplete="username"
            autoFocus
          />
          {fields.username && <p className="mt-1 text-sm text-red-600">{fields.username}</p>}
        </div>

        <div>
          <label htmlFor="auth-password" className="block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          {fields.password && <p className="mt-1 text-sm text-red-600">{fields.password}</p>}
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}
        </button>
      </form>
    </div>
  );
}
