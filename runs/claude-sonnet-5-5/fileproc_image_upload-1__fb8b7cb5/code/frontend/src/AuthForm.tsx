import { useState } from "react";
import { request } from "./api";

interface Props {
  onSignedIn: (token: string, username: string) => void;
  onClose: () => void;
}

export default function AuthForm({ onSignedIn, onClose }: Props) {
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
      const body = { username, password };
      if (mode === "register") {
        await request("/auth/register", { method: "POST", body });
      }
      const res = await request<{ token: string }>("/auth/login", { method: "POST", body });
      onSignedIn(res.token, username.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <form onSubmit={submit} className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg" aria-label={mode === "login" ? "Sign in" : "Register"}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{mode === "login" ? "Sign in" : "Create account"}</h2>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-800" aria-label="Close">
          ✕
        </button>
      </div>
      <label className="mb-3 block text-sm font-medium">
        Username
        <input className={`${input} mt-1`} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
      </label>
      <label className="mb-3 block text-sm font-medium">
        Password
        <input
          className={`${input} mt-1`}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
        />
      </label>
      {error && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
        {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}
      </button>
      <p className="mt-4 text-center text-sm text-slate-600">
        {mode === "login" ? "No account yet?" : "Already registered?"}{" "}
        <button
          type="button"
          className="font-medium text-indigo-600 hover:underline"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
        >
          {mode === "login" ? "Register" : "Sign in"}
        </button>
      </p>
    </form>
  );
}
