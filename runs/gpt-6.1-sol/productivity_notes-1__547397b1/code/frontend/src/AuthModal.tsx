import { useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "./api";
import type { FieldErrors, Session } from "./api";
import Icon from "./Icons";
import Modal from "./Modal";

export default function AuthModal({ initialMode, onClose, onSuccess }: { initialMode: "login" | "register"; onClose: () => void; onSuccess: (session: Session) => void }) {
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setErrors({});
    try {
      const body = { username, password };
      if (mode === "register") await api("/auth/register", { method: "POST", body });
      const session = await api<Session>("/auth/login", { method: "POST", body });
      onSuccess(session);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Please try again.");
      if (error instanceof ApiError) setErrors(error.errors);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={mode === "login" ? "Sign in" : "Create an account"} onClose={onClose} busy={busy}>
      <div className="mb-6 flex size-12 items-center justify-center rounded-xl bg-leaf"><Icon name="book" className="size-6" /></div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Your thoughts belong here</p>
      <h2 className="font-serif text-3xl">{mode === "login" ? "Welcome back." : "Make a little space."}</h2>
      <p className="mt-3 text-sm leading-6 text-muted">{mode === "login" ? "Sign in to pick up where you left off." : "Create an account to write, tag, and share your notes."}</p>
      <form onSubmit={submit} className="mt-7 space-y-5" noValidate>
        <div>
          <label htmlFor="username" className="mb-2 block text-sm font-medium">Username</label>
          <input id="username" name="username" autoFocus autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} disabled={busy} placeholder="Your username" aria-invalid={!!errors.username} aria-describedby={errors.username ? "username-error" : undefined} className={`w-full rounded-lg border bg-white px-3.5 py-3 text-sm focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/10 ${errors.username ? "border-red-400" : "border-line"}`} />
          {errors.username && <p id="username-error" className="mt-1.5 text-xs text-red-700">{errors.username}</p>}
        </div>
        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium">Password</label>
          <input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} placeholder={mode === "register" ? "At least 8 characters" : "Your password"} aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined} className={`w-full rounded-lg border bg-white px-3.5 py-3 text-sm focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/10 ${errors.password ? "border-red-400" : "border-line"}`} />
          {errors.password && <p id="password-error" className="mt-1.5 text-xs text-red-700">{errors.password}</p>}
        </div>
        {message && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-moss py-3 text-sm font-medium text-white transition hover:bg-ink">{busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}<Icon name="arrow" className="size-4" /></button>
      </form>
      <p className="mt-6 text-center text-xs text-muted">{mode === "login" ? "A new page? " : "Already have an account? "}<button type="button" disabled={busy} onClick={() => { setMode(mode === "login" ? "register" : "login"); setErrors({}); setMessage(""); }} className="font-medium text-moss underline decoration-moss/30 underline-offset-4">{mode === "login" ? "Create an account" : "Sign in"}</button></p>
    </Modal>
  );
}
