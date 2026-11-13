import { useState } from "react";
import { api, ApiError } from "./api";

const input =
  "w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";
const button =
  "rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50";

export default function AuthPanel({
  onLogin,
}: {
  onLogin: (token: string, username: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "register") {
        await api.register(username, password);
        setMode("login");
        setMessage({ ok: true, text: "Account created. You can sign in now." });
      } else {
        const res = await api.login(username, password);
        onLogin(res.token, res.username);
      }
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof ApiError ? err.message : "Request failed",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2" aria-label={mode}>
      <div className="w-36">
        <label className="mb-1 block text-xs text-slate-600" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className={input}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />
      </div>
      <div className="w-36">
        <label className="mb-1 block text-xs text-slate-600" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          className={input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
        />
      </div>
      <button type="submit" className={button} disabled={busy}>
        {mode === "login" ? "Sign in" : "Register"}
      </button>
      <button
        type="button"
        className="text-sm text-indigo-700 underline"
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setMessage(null);
        }}
      >
        {mode === "login" ? "Create an account" : "Have an account? Sign in"}
      </button>
      {message && (
        <p
          role="status"
          className={`w-full text-sm ${message.ok ? "text-green-700" : "text-red-700"}`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
