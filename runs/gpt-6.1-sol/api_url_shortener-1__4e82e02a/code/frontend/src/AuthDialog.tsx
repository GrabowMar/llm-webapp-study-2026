import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "./api";
import type { User } from "./api";
import Icon from "./Icon";
import Modal from "./Modal";

export type AuthMode = "login" | "register";

export default function AuthDialog({ initialMode, onClose, onAuthenticated }: { initialMode: AuthMode; onClose: () => void; onAuthenticated: (token: string, user: User) => void }) {
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const body = JSON.stringify({ username, password });
      if (mode === "register") await api("/auth/register", { method: "POST", body });
      const { token } = await api<{ token: string }>("/auth/login", { method: "POST", body });
      const user = await api<User>("/auth/me", {}, token);
      onAuthenticated(token, user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={mode === "login" ? "Welcome back." : "A shorter link starts here."} onClose={onClose}>
      <p className="mb-7 mt-2 text-sm leading-6 text-stone-500">{mode === "login" ? "Sign in to create, share, and manage your links." : "Create your free account. Make a little room for big ideas."}</p>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="username" className="mb-2 block text-sm font-medium">Username</label>
          <input id="username" value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={32} pattern="[A-Za-z0-9_.\-]+" autoComplete="username" placeholder="Your username" className="w-full rounded-xl border border-stone-200 bg-canvas px-4 py-3 text-sm outline-none transition focus:border-forest focus:ring-3 focus:ring-forest/10" />
          {mode === "register" && <p className="mt-2 text-xs text-stone-400">Letters, numbers, dots, dashes, and underscores.</p>}
        </div>
        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium">Password</label>
          <input id="password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={256} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Your password" className="w-full rounded-xl border border-stone-200 bg-canvas px-4 py-3 text-sm outline-none transition focus:border-forest focus:ring-3 focus:ring-forest/10" />
        </div>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <button disabled={busy} className="flex w-full items-center justify-center gap-3 rounded-xl bg-forest px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-ink disabled:cursor-wait disabled:opacity-60">{busy ? "Just a moment…" : mode === "login" ? "Sign in" : "Create account"}<Icon name="arrow" className="h-4 w-4" /></button>
      </form>
      <p className="mt-6 text-center text-sm text-stone-500">{mode === "login" ? "New around here?" : "Already have an account?"} <button type="button" disabled={busy} onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }} className="font-semibold text-forest hover:underline">{mode === "login" ? "Create an account" : "Sign in"}</button></p>
    </Modal>
  );
}
