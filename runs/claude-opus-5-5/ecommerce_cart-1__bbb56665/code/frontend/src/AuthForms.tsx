import { useState } from "react";
import { api, ApiError, setToken, type User } from "./api";

type Props = { onSignedIn: (user: User) => void };

export default function AuthForms({ onSignedIn }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await api("/auth/register", { method: "POST", body: { username, password } });
      }
      const res = await api<{ token: string; user?: User }>("/auth/login", {
        method: "POST",
        body: { username, password },
      });
      setToken(res.token);
      const user = res.user ?? (await api<User>("/auth/me"));
      setPassword("");
      onSignedIn(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const tabClass = (active: boolean) =>
    `flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
      active ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:text-slate-700"
    }`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
        <button type="button" className={tabClass(mode === "login")} onClick={() => setMode("login")}>
          Sign in
        </button>
        <button type="button" className={tabClass(mode === "register")} onClick={() => setMode("register")}>
          Register
        </button>
      </div>
      <form onSubmit={submit} className="space-y-3" aria-label={mode === "login" ? "Sign in" : "Register"}>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Username</span>
          <input
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Password</span>
          <input
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {notice && <p className="text-sm text-green-700">{notice}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
