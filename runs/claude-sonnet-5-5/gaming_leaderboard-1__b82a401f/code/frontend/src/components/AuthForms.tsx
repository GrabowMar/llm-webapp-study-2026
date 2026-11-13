import { useState } from "react";
import { api, ApiError } from "../api";

const input =
  "w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const button =
  "rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50";

export default function AuthForms({
  onSignedIn,
}: {
  onSignedIn: (username: string, token: string) => void;
}) {
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
        setMode("login");
        setNotice("Account created. Sign in to continue.");
        setPassword("");
      } else {
        const res = await api<{ token: string }>("/auth/login", {
          method: "POST",
          body: { username, password },
        });
        onSignedIn(username, res.token);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg bg-white p-5 shadow">
      <div className="mb-4 flex gap-2" role="tablist">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
              setNotice(null);
            }}
            className={`rounded px-3 py-1 text-sm font-medium ${
              mode === m ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {m === "login" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="username" className="mb-1 block text-sm text-slate-600">
            Username
          </label>
          <input
            id="username"
            name="username"
            className={input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm text-slate-600">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className={input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {notice && <p className="text-sm text-green-700">{notice}</p>}
        <button type="submit" className={button} disabled={busy}>
          {mode === "login" ? "Sign in" : "Register"}
        </button>
      </form>
    </section>
  );
}
