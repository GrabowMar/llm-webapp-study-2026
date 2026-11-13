import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, MessageSquare, Users } from "lucide-react";
import { api, ApiError, message } from "./api";
import { useAuth } from "./App";
import { Alert, Field, inputClass, Logo, primaryButton } from "./ui";

export function AuthScreen() {
  const { signIn } = useAuth();
  const [register, setRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState("");
  function changeMode(mode: boolean) { setRegister(mode); setError(""); setErrors({}); setSuccess(""); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setErrors({}); setSuccess("");
    try {
      if (register) {
        await api("/auth/register", { method: "POST", body: JSON.stringify({ username, password }) });
        setRegister(false); setPassword(""); setSuccess("Account created. Sign in to join your workspace.");
      } else {
        const { token } = await api<{ token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
        await signIn(token);
      }
    } catch (err) { setError(message(err)); if (err instanceof ApiError) setErrors(err.errors); }
    finally { setBusy(false); }
  }
  return <div className="min-h-dvh bg-[#fcfcfa] lg:grid lg:grid-cols-[1fr_1fr]">
    <section className="relative hidden flex-col overflow-hidden bg-brand-900 px-8 py-8 text-white lg:flex lg:min-h-dvh lg:px-16 lg:py-12 xl:px-20">
      <Logo light />
      <div className="relative z-10 my-auto max-w-lg py-14 lg:py-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-brand-200"><span className="size-1.5 rounded-full bg-brand-200" /> A shared space for your team</span>
        <h1 className="mt-7 font-serif text-5xl leading-[1.12] tracking-[-1.5px] xl:text-6xl">People first.<br />Everything else,<br /><span className="text-brand-200">in one place.</span></h1>
        <p className="mt-6 max-w-sm text-[15px] leading-7 text-white/60">A little context makes a big difference. Keep your customers and conversations together, so every relationship feels personal.</p>
        <div className="relative mt-12 hidden max-w-sm rounded-2xl border border-white/15 bg-white/[0.07] p-6 shadow-xl sm:block">
          <div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-full bg-brand-200 text-brand-800"><Users size={21} /></div><div><p className="text-sm font-medium">Better together</p><p className="mt-1 text-xs text-white/45">One directory. Your whole team.</p></div><span className="ml-auto flex size-7 items-center justify-center rounded-full bg-white/10"><Check size={14} className="text-brand-200" /></span></div>
          <div className="mt-5 space-y-3 border-t border-white/10 pt-5"><p className="flex items-center gap-3 text-xs text-white/65"><Mail size={15} className="text-brand-200" /> Every contact, easy to find</p><p className="flex items-center gap-3 text-xs text-white/65"><MessageSquare size={15} className="text-brand-200" /> Every conversation, remembered</p></div>
        </div>
      </div>
      <div className="relative z-10 flex items-center gap-2 text-xs text-white/40"><LockKeyhole size={13} /> Private to your team. Built around your customers.</div>
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 -right-48 size-[600px] rounded-full border border-white/[0.06]" /><div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-24 size-[360px] rounded-full border border-white/[0.06]" />
    </section>
    <section className="flex min-h-dvh flex-col px-7 py-10 sm:px-16 lg:px-20">
      <div className="mb-14 flex items-center justify-between text-xs text-slate-400 lg:justify-end"><span className="lg:hidden"><Logo /></span><span className="hidden sm:inline">THE CUSTOMER DIRECTORY, SIMPLIFIED</span></div>
      <div className="mx-auto my-auto w-full max-w-[370px] pb-12">
        <div className="mb-8 flex gap-1 rounded-lg bg-slate-100 p-1"><button disabled={busy} onClick={() => changeMode(false)} className={`flex-1 rounded-md py-2.5 text-sm font-medium transition ${!register ? "bg-white text-brand-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Sign in</button><button disabled={busy} onClick={() => changeMode(true)} className={`flex-1 rounded-md py-2.5 text-sm font-medium transition ${register ? "bg-white text-brand-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Create account</button></div>
        <h2 className="text-3xl font-semibold tracking-[-1px] text-slate-800">{register ? "Make yourself at home." : "Welcome back."}</h2>
        <p className="mb-8 mt-2.5 text-sm leading-6 text-slate-500">{register ? "Join your team’s shared customer directory." : "Your team’s customers and conversations, together."}</p>
        <form onSubmit={submit} noValidate className="space-y-5">
          {error && <Alert>{error}</Alert>}{success && <Alert success>{success}</Alert>}
          <Field label="Username" id="username" error={errors.username}><input autoFocus id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} disabled={busy} placeholder="Your username" className={inputClass} aria-invalid={!!errors.username} aria-describedby={errors.username ? "username-error" : undefined} /></Field>
          <Field label="Password" id="password" error={errors.password} hint={register ? "Use at least 8 characters." : undefined}><div className="relative"><input id="password" type={visible ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} placeholder="Your password" className={`${inputClass} pr-11`} aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined} /><button type="button" aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(!visible)} className="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-700">{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></Field>
          <button disabled={busy} className={`${primaryButton} mt-1 w-full py-3`}>{busy ? "Please wait…" : register ? "Create your account" : "Sign in to your workspace"}{!busy && <ArrowRight size={16} />}</button>
        </form>
        <p className="mt-7 text-center text-xs leading-5 text-slate-400">{register ? "Already part of the team?" : "New to Commonplace?"} <button onClick={() => changeMode(!register)} className="font-medium text-brand-700 hover:underline">{register ? "Sign in" : "Create an account"}</button></p>
      </div>
      <p className="text-center text-xs text-slate-400">A place for every customer. Context for every conversation.</p>
    </section>
  </div>;
}
