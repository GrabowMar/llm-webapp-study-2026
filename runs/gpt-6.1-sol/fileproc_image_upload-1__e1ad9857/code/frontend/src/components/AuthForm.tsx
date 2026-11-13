import { useState, type FormEvent } from "react";
import { Aperture, ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { api, type Session } from "../api";

interface AuthFormProps {
  initialMode: "login" | "register";
  onSuccess: (session: Session) => void;
}

export default function AuthForm({ initialMode, onSuccess }: AuthFormProps) {
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const registering = mode === "register";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const body = JSON.stringify({ username: username.trim(), password });
    try {
      if (registering) await api("/auth/register", { method: "POST", body });
      const { token } = await api<{ token: string }>("/auth/login", { method: "POST", body });
      const user = await api<{ username: string }>("/auth/me", {}, token);
      onSuccess({ token, username: user.username });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-7 sm:p-9">
      <Aperture className="mb-6 text-accent" size={34} strokeWidth={1.7} />
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.2em] text-muted">Your point of view matters</p>
      <h2 className="font-serif text-3xl tracking-tight">{registering ? "Find your little space." : "Welcome back."}</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted">{registering ? "Join Folio and share the world through your lens." : "Sign in to share a moment, or revisit your own perspectives."}</p>
      <form onSubmit={submit} className="mt-7 space-y-5">
        <div><label htmlFor="auth-username" className="block text-sm font-medium">Username</label><input id="auth-username" aria-describedby="username-help" autoFocus autoComplete="username" required pattern="[A-Za-z0-9_.\-]+" maxLength={32} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Your username" className="form-input mt-2" /><p id="username-help" className="mt-1.5 text-xs text-muted">Letters, numbers, dots, underscores and hyphens.</p></div>
        <div><label htmlFor="auth-password" className="block text-sm font-medium">Password</label><div className="relative mt-2"><input id="auth-password" autoComplete={registering ? "new-password" : "current-password"} type={showPassword ? "text" : "password"} required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={registering ? "Choose a password" : "Your password"} className="form-input pr-12" /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3.5 text-muted">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm leading-relaxed text-red-700">{error}</p>}
        <button disabled={busy} className="button-primary w-full">{busy ? <LoaderCircle size={17} className="animate-spin" /> : null}{registering ? "Create your account" : "Sign in"}{!busy && <ArrowRight size={17} />}</button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">{registering ? "Already part of the community?" : "New around here?"} <button disabled={busy} onClick={() => { setMode(registering ? "login" : "register"); setError(""); }} className="font-semibold text-accent hover:underline">{registering ? "Sign in" : "Join Folio"}</button></p>
    </div>
  );
}
