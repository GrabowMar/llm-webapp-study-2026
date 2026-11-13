import { useState, type FormEvent } from "react";
import { login, register, saveSession } from "../api";
import Message from "./Message";

export default function AuthPanel({
  onSignedIn,
}: {
  onSignedIn: (username: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      if (mode === "register") {
        await register(username, password);
      }
      const { token } = await login(username, password);
      saveSession(token, username);
      setPassword("");
      onSignedIn(username);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setMessage("");
          }}
          className={
            mode === "login"
              ? "rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
              : "rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          }
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("register");
            setMessage("");
          }}
          className={
            mode === "register"
              ? "rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
              : "rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          }
        >
          Register
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid max-w-md gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Username
          </span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>
        <Message kind="error" text={message} />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
    </section>
  );
}
