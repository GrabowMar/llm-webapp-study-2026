import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "./api";
import type { User } from "./api";
import { BrandMark, Icon } from "./Icons";
import { ErrorMessage, Modal } from "./Modal";

export const inputClass = "w-full rounded-md border border-line bg-white px-3.5 py-3 text-sm transition placeholder:text-muted/60 focus:border-rust focus:ring-1 focus:ring-rust focus:ring-offset-0";
export const primaryButton = "inline-flex items-center justify-center gap-3 rounded-md bg-rust px-5 py-3.5 text-sm font-medium text-white transition hover:bg-rust-dark disabled:opacity-50";

export function AuthForm({ onDismiss, onAuthenticated, initialMode = "login" }: { onDismiss: () => void; onAuthenticated: (token: string, user: User) => void; initialMode?: "login" | "register" }) {
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={mode === "login" ? "Welcome back." : "Make yourself at home."} onDismiss={onDismiss}>
    <div className="px-7 py-7">
      <BrandMark className="mb-5 h-8 w-8 text-rust" />
      <p className="mb-7 text-sm leading-relaxed text-muted">{mode === "login" ? "Sign in to keep your favorite objects together. Your personal cart will be right where you left it." : "Create an account and start a collection of things you’ll love living with."}</p>
      <form onSubmit={submit} className="space-y-5">
        <label className="block text-sm font-medium">Username<input data-autofocus required autoComplete="username" maxLength={32} pattern="[a-zA-Z0-9_.\-]+" className={`${inputClass} mt-2`} placeholder="Your username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label className="block text-sm font-medium">Password<input required type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} maxLength={256} className={`${inputClass} mt-2`} placeholder="Your password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <ErrorMessage message={error} />
        <button disabled={busy} className={`${primaryButton} w-full`}>{busy ? <Icon name="loader" className="animate-spin" /> : <>{mode === "login" ? "Sign in" : "Create account"}<Icon name="arrow" className="h-4 w-4" /></>}</button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">{mode === "login" ? "New around here?" : "Already part of the family?"} <button className="ml-1 font-medium text-rust underline underline-offset-4" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Create an account" : "Sign in"}</button></p>
    </div>
    <div className="border-t border-line px-7 py-4 text-center text-xs text-muted">A little less noise. A little more everyday joy.</div>
  </Modal>;
}
