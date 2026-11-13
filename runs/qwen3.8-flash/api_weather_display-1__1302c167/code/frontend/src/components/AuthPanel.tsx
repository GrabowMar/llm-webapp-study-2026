import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError, login, register, setSession } from "../api";

interface Props {
  signedIn: string | null;
  onSignIn: (token: string, username: string) => void;
  onSignOut: () => void;
}

export default function AuthPanel({ signedIn, onSignIn, onSignOut }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (signedIn) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-600">
          Signed in as <span className="font-semibold text-slate-900">{signedIn}</span>
        </span>
        <button
          onClick={onSignOut}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Sign out
        </button>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await register(username.trim(), password);
        setInfo("Account created — you can sign in now.");
        setMode("login");
        setPassword("");
      } else {
        const token = await login(username.trim(), password);
        setSession(token, username.trim());
        onSignIn(token, username.trim());
        setPassword("");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex gap-2">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
              mode === m ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {m === "login" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {info && <p className="text-sm text-emerald-700">{info}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
      >
        {mode === "login" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}
