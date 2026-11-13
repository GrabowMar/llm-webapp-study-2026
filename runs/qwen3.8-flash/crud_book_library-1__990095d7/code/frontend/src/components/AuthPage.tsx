import { useState } from "react";
import { ApiError, login, register } from "../api";
import { ErrorBanner, btnPrimary, inputCls, labelCls, cardCls } from "../ui";

interface Props {
  onAuthed: (token: string, username: string) => void;
}

export default function AuthPage({ onAuthed }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await register(username, password);
      }
      const res = await login(username, password);
      onAuthed(res.token, username.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Network error, please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md pt-12">
      <div className={cardCls}>
        <div className="mb-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => { setMode("login"); setError(null); }}
            className={`rounded-md py-2 transition ${mode === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => { setMode("register"); setError(null); }}
            className={`rounded-md py-2 transition ${mode === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            Register
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={labelCls} htmlFor="username">Username</label>
            <input
              id="username"
              className={inputCls}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </div>
          <ErrorBanner message={error} />
          <button type="submit" className={`${btnPrimary} w-full`} disabled={busy}>
            {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          Browse books and reviews without an account. Sign in to add, edit or delete books and to write reviews.
        </p>
      </div>
    </div>
  );
}
