import { useState, type FormEvent } from "react";
import { ArrowRight, Sprout } from "lucide-react";
import { api, ApiError } from "./api";
import { ErrorBox, Field, inputClass, Modal, primaryButton } from "./ui";

export default function AuthForm({ mode, onMode, onClose, onLogin }: { mode: "login" | "register"; onMode: (mode: "login" | "register") => void; onClose: () => void; onLogin: (token: string, username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const registering = mode === "register";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    try {
      const body = JSON.stringify({ username, password });
      if (registering) await api("/auth/register", { method: "POST", body });
      const result = await api<{ token: string }>("/auth/login", { method: "POST", body });
      const user = await api<{ username: string }>("/auth/me", {}, result.token);
      onLogin(result.token, user.username);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in. Please try again.");
      if (caught instanceof ApiError) setFields(caught.fields);
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={registering ? "A seat at the table." : "Welcome back."} onClose={onClose}>
    <div className="mb-6 flex items-start gap-3 text-sm leading-relaxed text-muted"><Sprout size={25} className="mt-1 shrink-0 text-olive" /><p>{registering ? "Good recipes are even better when shared. Join our little community of home cooks." : "Sign in to share a new favorite or make a little change to your recipes."}</p></div>
    <form onSubmit={submit} noValidate className="space-y-5">
      {error && <ErrorBox message={error} />}
      <Field name="username" label="Username" error={fields.username} hint={registering ? "3–30 letters, numbers, dots, hyphens or underscores." : undefined}>
        <input id="username" autoFocus autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} className={inputClass} placeholder="Your kitchen name" aria-invalid={!!fields.username} aria-describedby={fields.username ? "username-error" : undefined} />
      </Field>
      <Field name="password" label="Password" error={fields.password} hint={registering ? "At least 8 characters. Make it a good one." : undefined}>
        <input id="password" type="password" autoComplete={registering ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} className={inputClass} placeholder="Your password" aria-invalid={!!fields.password} aria-describedby={fields.password ? "password-error" : undefined} />
      </Field>
      <button disabled={busy} className={`${primaryButton} w-full`}>{busy ? "Just a moment…" : registering ? "Create your account" : "Sign in"}<ArrowRight size={16} /></button>
    </form>
    <p className="mt-6 border-t border-line pt-5 text-center text-sm text-muted">{registering ? "Already part of the kitchen?" : "New to Table & Thyme?"} <button onClick={() => onMode(registering ? "login" : "register")} className="font-medium text-olive underline decoration-olive/30 underline-offset-4">{registering ? "Sign in" : "Create an account"}</button></p>
  </Modal>;
}
