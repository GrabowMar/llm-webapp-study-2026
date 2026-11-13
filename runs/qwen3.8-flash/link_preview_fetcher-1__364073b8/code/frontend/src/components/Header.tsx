import { useState, type FormEvent } from "react";
import { api, setToken } from "../api";

interface Props {
  username: string | null;
  onAuthed: (username: string) => void;
  onSignOut: () => void;
}

export default function Header({ username, onAuthed, onSignOut }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [fieldUsername, setFieldUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register(fieldUsername, password);
        const { token } = await api.login(fieldUsername, password);
        setToken(token);
        onAuthed(fieldUsername);
      } else {
        const { token } = await api.login(fieldUsername, password);
        setToken(token);
        onAuthed(fieldUsername);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function handleSignOut() {
    api.logout().catch(() => undefined);
    setToken(null);
    onSignOut();
  }

  if (username) {
    return (
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold text-slate-800">Link Previews</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              Signed in as <span className="font-medium">{username}</span>
            </span>
            <button
              onClick={handleSignOut}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-3xl px-4 py-3">
        <h1 className="mb-3 text-lg font-semibold text-slate-800">Link Previews</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <input
            value={fieldUsername}
            onChange={(e) => setFieldUsername(e.target.value)}
            placeholder="Username"
            autoComplete="username"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none sm:w-40"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none sm:w-40"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
            className="text-sm text-blue-600 hover:underline sm:self-center"
          >
            {mode === "login" ? "Create an account" : "Switch to sign in"}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </header>
  );
}
