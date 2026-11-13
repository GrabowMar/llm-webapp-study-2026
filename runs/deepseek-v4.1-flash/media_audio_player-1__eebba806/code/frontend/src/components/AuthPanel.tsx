import { useState } from "react";
import { api, ApiError } from "../api";
import type { Session } from "../types";

interface Props {
  session: Session | null;
  onSession: (session: Session | null) => void;
}

type Mode = "login" | "register";

export default function AuthPanel({ session, onSession }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (session) {
    return (
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-slate-300 sm:inline">
          Signed in as{" "}
          <span className="font-semibold text-white">{session.username}</span>
        </span>
        <button
          type="button"
          onClick={() => {
            api.logout(session.token).catch(() => undefined);
            onSession(null);
          }}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
        >
          Sign out
        </button>
      </div>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    try {
      if (mode === "register") {
        await api.register(username, password);
      }
      const result = await api.login(username, password);
      onSession({ token: result.token, username: result.username });
      setUsername("");
      setPassword("");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-xs rounded-xl border border-slate-800 bg-slate-900/70 p-3 shadow-lg backdrop-blur"
    >
      <div className="mb-2 flex rounded-lg bg-slate-800 p-0.5 text-xs font-semibold">
        {(["login", "register"] as Mode[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setMode(value);
              setError("");
              setFields({});
            }}
            className={`flex-1 rounded-md px-2 py-1 capitalize transition ${
              mode === value
                ? "bg-indigo-500 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {value === "login" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>

      <label className="block text-xs font-medium text-slate-400" htmlFor="auth-username">
        Username
      </label>
      <input
        id="auth-username"
        value={username}
        autoComplete="username"
        onChange={(event) => setUsername(event.target.value)}
        className="mt-0.5 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-500"
      />
      {fields.username && (
        <p className="mt-1 text-xs text-rose-400">{fields.username}</p>
      )}

      <label
        className="mt-2 block text-xs font-medium text-slate-400"
        htmlFor="auth-password"
      >
        Password
      </label>
      <input
        id="auth-password"
        type="password"
        value={password}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        onChange={(event) => setPassword(event.target.value)}
        className="mt-0.5 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-500"
      />
      {fields.password && (
        <p className="mt-1 text-xs text-rose-400">{fields.password}</p>
      )}

      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="mt-3 w-full rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}
