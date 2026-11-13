import { useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError, errorMessage, setToken } from "./api";
import type { User } from "./api";
import { Icon } from "./Icons";
import { ErrorBanner, inputClass, Modal, primaryButton } from "./ui";

export default function Auth({ initialMode, onClose, onSuccess }: { initialMode: "login" | "register"; onClose: () => void; onSuccess: (user: User) => void }) {
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setFields({});
    let registered = false;
    try {
      if (mode === "register") {
        await api("/auth/register", { method: "POST", body: JSON.stringify({ username, password }) });
        registered = true;
      }
      const result = await api<{ token: string; user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      setToken(result.token);
      onSuccess(result.user);
    } catch (error) {
      setError(errorMessage(error));
      if (error instanceof ApiError) setFields(error.fields);
      if (registered) { setMode("login"); setError(`Your account is ready. Please sign in: ${errorMessage(error)}`); }
    } finally { setBusy(false); }
  }
  return <Modal onClose={onClose} title={mode === "login" ? "Sign in to Quizly" : "Create your Quizly account"}>
    <span className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-lime"><Icon name="spark" size={28} /></span>
    <p className="mb-2 text-[10px] font-medium tracking-[.16em] text-muted uppercase">Your next chapter of curiosity</p>
    <h2 className="text-3xl font-semibold tracking-[-1px]">{mode === "login" ? "Good to see you." : "Stay curious with us."}</h2>
    <p className="mt-3 text-sm leading-relaxed text-muted">{mode === "login" ? "Sign in to keep your discoveries, scores, and little victories all in one place." : "A free account. A history of discoveries. A little wiser, every time."}</p>
    <form onSubmit={submit} className="mt-7 space-y-5">
      <ErrorBanner message={error} />
      <div><label htmlFor="auth-username" className="mb-2 block text-xs font-medium">Username</label><input id="auth-username" autoComplete="username" autoFocus required maxLength={32} value={username} onChange={event => setUsername(event.target.value)} className={inputClass} placeholder="Your curious alter ego" aria-invalid={!!fields.username} aria-describedby={fields.username ? "username-error" : undefined} />{fields.username && <p id="username-error" className="mt-2 text-xs text-red-700">{fields.username}</p>}</div>
      <div><label htmlFor="auth-password" className="mb-2 block text-xs font-medium">Password</label><input id="auth-password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 8 : undefined} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} className={inputClass} placeholder={mode === "register" ? "At least 8 characters" : "Your password"} aria-invalid={!!fields.password} aria-describedby={fields.password ? "password-error" : undefined} />{fields.password && <p id="password-error" className="mt-2 text-xs text-red-700">{fields.password}</p>}</div>
      <button disabled={busy} className={`${primaryButton} w-full`}>{busy ? "One little moment…" : mode === "login" ? "Sign in" : "Create account"}<Icon name="arrow" size={17} /></button>
    </form>
    <p className="mt-6 text-center text-xs text-muted">{mode === "login" ? "New around here?" : "Already part of the curious crowd?"} <button disabled={busy} onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setFields({}); }} className="ml-1 font-semibold text-ink underline decoration-[#bac9ad] underline-offset-4">{mode === "login" ? "Create an account" : "Sign in"}</button></p>
  </Modal>;
}
