import { useState } from "react";
import type { FormEvent } from "react";
import { api, errorMessage } from "./api";
import type { Session } from "./api";
import Icon from "./icons";
import Modal from "./Modal";

export default function AuthModal({ initialMode, onClose, onSuccess }: { initialMode: "login" | "register"; onClose: () => void; onSuccess: (session: Session) => void }) {
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = JSON.stringify({ username: username.trim(), password });
      if (mode === "register") await api("/auth/register", { method: "POST", body });
      const { token } = await api<{ token: string }>("/auth/login", { method: "POST", body });
      const user = await api<{ username: string }>("/auth/me", {}, token);
      onSuccess({ token, username: user.username });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={mode === "login" ? "Sign in" : "Create an account"} onClose={onClose}>
    <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-mint text-forest"><Icon name="lock" className="h-6 w-6" /></div>
    <p className="mb-2 text-[10px] font-bold tracking-[0.18em] text-forest">YOUR OWN LITTLE SPACE</p>
    <h2 className="text-3xl font-semibold tracking-tight">{mode === "login" ? "Welcome back." : "Keep it for later."}</h2>
    <p className="mt-3 text-sm leading-6 text-muted">{mode === "login" ? "Sign in to pick up where you left off. Your conversion history is just for you." : "Create a free account and give your conversions a private place to live."}</p>
    <form onSubmit={submit} className="mt-7 space-y-5">
      <div><label htmlFor="username" className="mb-2 block text-sm font-medium">Username</label><input id="username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={80} placeholder="Your username" disabled={busy} className="w-full rounded-lg border border-line bg-white px-4 py-3 text-sm placeholder:text-muted/70" /></div>
      <div><label htmlFor="password" className="mb-2 block text-sm font-medium">Password</label><input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={1024} placeholder={mode === "login" ? "Your password" : "Choose a password"} disabled={busy} className="w-full rounded-lg border border-line bg-white px-4 py-3 text-sm placeholder:text-muted/70" /></div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button disabled={busy} className="flex w-full items-center justify-center gap-3 rounded-lg bg-forest py-3.5 text-sm font-medium text-white transition-colors hover:bg-ink disabled:opacity-50">{busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}<Icon name="arrow" /></button>
    </form>
    <p className="mt-6 text-center text-sm text-muted">{mode === "login" ? "New around here?" : "Already have an account?"} <button type="button" disabled={busy} onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }} className="ml-1 font-medium text-forest hover:underline">{mode === "login" ? "Create an account" : "Sign in"}</button></p>
    <div className="mt-7 flex items-center justify-center gap-2 border-t border-line pt-5 text-xs text-muted"><Icon name="shield" className="h-3.5 w-3.5" />Private history. No unnecessary extras.</div>
  </Modal>;
}
