import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { api, type Session } from "../api";
import Dialog from "./Dialog";

export default function AuthDialog({ initialMode, onClose, onSession }: {
  initialMode: "login" | "register";
  onClose: () => void;
  onSession: (session: Session) => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "register" && !registered) {
        await api("/auth/register", { method: "POST", body: { username, password } });
        setRegistered(true);
      }
      const { token } = await api<{ token: string }>("/auth/login", {
        method: "POST", body: { username, password },
      });
      onSession({ token, username: username.trim() });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={mode === "login" ? "Welcome back." : "Make yourself at home."} onClose={onClose} busy={busy}>
      <p className="mt-3 text-sm leading-relaxed text-muted">{mode === "login" ? "Your good finds are right where you left them." : "A personal space for everything worth coming back to."}</p>
      <form onSubmit={submit} className="mt-7 space-y-5">
        <div>
          <label htmlFor="username" className="mb-2 block text-sm font-medium">Username</label>
          <input id="username" name="username" required maxLength={64} autoComplete="username" value={username} disabled={busy || registered} onChange={(event) => setUsername(event.target.value)} className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm placeholder:text-muted/60 disabled:bg-sidebar" placeholder="Your name around here" />
        </div>
        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium">Password</label>
          <input id="password" name="password" type="password" required maxLength={1024} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm placeholder:text-muted/60" placeholder="Keep your corner private" />
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{registered ? "Account created. " : ""}{error}</p>}
        <button disabled={busy} className="flex w-full items-center justify-center gap-3 rounded-xl bg-olive px-4 py-3.5 text-sm font-medium text-white transition hover:bg-olive/90 disabled:opacity-60">
          {busy ? <LoaderCircle size={17} className="animate-spin motion-reduce:animate-none" /> : <ArrowRight size={17} />}
          {busy ? "One moment…" : mode === "login" || registered ? "Sign in" : "Create account"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">{mode === "login" ? "New to Marginal?" : "Already have an account?"}{" "}
        <button disabled={busy} className="font-medium text-olive underline decoration-olive/30 underline-offset-4" onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setError("");
          setRegistered(false);
        }}>{mode === "login" ? "Create an account" : "Sign in"}</button>
      </p>
      <div className="mt-7 flex items-center justify-center gap-2 border-t border-line pt-5 text-xs text-muted"><LockKeyhole size={13} /> Your links are private. Always.</div>
    </Dialog>
  );
}
