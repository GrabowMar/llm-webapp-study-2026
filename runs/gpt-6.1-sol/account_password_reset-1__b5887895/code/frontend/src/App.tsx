import { useEffect, useId, useState } from "react";
import type { FormEvent, InputHTMLAttributes, ReactNode } from "react";
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronDown,
  ChevronRight, CircleHelp, Eye, EyeOff, Fingerprint, Inbox, KeyRound,
  LockKeyhole, LogOut, Mail, Menu, RefreshCw, Send, Shield, ShieldCheck,
  Sparkles, UserRound, X,
} from "lucide-react";

type Account = { id: number; username: string; email: string | null };
type Message = { id: number; to: string; subject: string; body: string; sent_at: string };
type Navigate = (path: string) => void;

const inputClass = "w-full rounded-lg border border-[#dfe2e7] bg-white py-3 pl-11 pr-4 text-[13px] text-ink outline-none transition placeholder:text-[#a0a5ae] focus:border-accent focus:ring-3 focus:ring-accent/10 disabled:bg-gray-50";
const primaryClass = "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 text-[13px] font-semibold text-white transition hover:bg-[#c65b39] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-60";

async function api<T>(path: string, options: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data as T;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "We couldn't connect. Please try again.";
}

function Field({ label, icon, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; icon?: ReactNode; hint?: string }) {
  const id = useId();
  return <div>
    <label htmlFor={id} className="mb-2 block text-[12px] font-semibold text-ink">{label}</label>
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[#9197a1]">{icon}</span>
      <input id={id} className={inputClass} {...props} />
    </div>
    {hint && <p className="mt-2 text-[11px] leading-relaxed text-muted">{hint}</p>}
  </div>;
}

function PasswordField({ label = "Password", ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return <div>
    <label htmlFor={id} className="mb-2 block text-[12px] font-semibold text-ink">{label}</label>
    <div className="relative">
      <LockKeyhole size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[#9197a1]" />
      <input id={id} className={`${inputClass} pr-11`} type={visible ? "text" : "password"} {...props} />
      <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} className="absolute top-1/2 right-3.5 -translate-y-1/2 rounded text-[#9197a1] hover:text-ink focus-visible:outline-accent">
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  </div>;
}

function Notice({ children, success = false }: { children: ReactNode; success?: boolean }) {
  return <div role={success ? "status" : "alert"} className={`flex gap-2.5 rounded-lg p-3.5 text-[12px] leading-relaxed ${success ? "bg-[#edf5ef] text-[#3c7150]" : "bg-red-50 text-red-700"}`}>
    {success ? <CheckCheck size={17} className="mt-0.5 shrink-0" /> : <CircleHelp size={17} className="mt-0.5 shrink-0" />}
    <span>{children}</span>
  </div>;
}

function Brand() {
  return <div className="flex items-center gap-2.5">
    <div className="flex size-8 items-center justify-center rounded-[10px] bg-accent text-white"><KeyRound size={19} strokeWidth={2.2} className="-rotate-45" /></div>
    <span className="text-[23px] font-bold tracking-[-1px] text-ink">keyspace<span className="text-accent">.</span></span>
  </div>;
}

function KeyIllustration() {
  return <svg viewBox="0 0 420 270" fill="none" aria-hidden="true" className="mx-auto h-[240px] w-full max-w-[420px]">
    <defs>
      <pattern id="dots" x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="0.8" fill="#D7B7A5" opacity="0.5" /></pattern>
      <linearGradient id="card" x1="135" y1="65" x2="275" y2="210" gradientUnits="userSpaceOnUse"><stop stopColor="#fffefa" /><stop offset="1" stopColor="#F9F7F0" /></linearGradient>
      <linearGradient id="key" x1="229" y1="111" x2="306" y2="204" gradientUnits="userSpaceOnUse"><stop stopColor="#E89968" /><stop offset="1" stopColor="#CF6544" /></linearGradient>
      <filter id="shadow" x="-70%" y="-70%" width="240%" height="260%"><feDropShadow dx="0" dy="12" stdDeviation="13" floodColor="#795543" floodOpacity="0.13" /></filter>
    </defs>
    <circle cx="210" cy="137" r="113" fill="url(#dots)" />
    <circle cx="210" cy="137" r="104" stroke="#E3CDBD" strokeDasharray="3 6" opacity="0.65" />
    <circle cx="210" cy="137" r="78" fill="#EDDBCC" opacity="0.6" />
    <ellipse cx="210" cy="233" rx="85" ry="8" fill="#DDC2AE" opacity="0.27" />
    <g filter="url(#shadow)" transform="rotate(-10 198 137)">
      <rect x="137" y="64" width="128" height="157" rx="17" fill="url(#card)" stroke="#E3D8CD" />
      <path d="M185 116V102a17 17 0 0 1 34 0v14" stroke="#899085" strokeWidth="7" strokeLinecap="round" />
      <rect x="172" y="112" width="60" height="53" rx="12" fill="#5D6D60" />
      <circle cx="202" cy="134" r="5" fill="#F5F2E9" /><path d="M202 136v8" stroke="#F5F2E9" strokeWidth="4" strokeLinecap="round" />
      <rect x="167" y="183" width="69" height="5" rx="2.5" fill="#E3E3DA" /><rect x="181" y="195" width="41" height="4" rx="2" fill="#E8E7DF" />
    </g>
    <g filter="url(#shadow)" transform="rotate(-36 273 162)">
      <path d="M273 154v66h13v-13h12v-13h-12v-40" fill="url(#key)" stroke="#C96B46" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="279.5" cy="133" r="28" fill="url(#key)" stroke="#C96B46" strokeWidth="1.5" />
      <circle cx="279.5" cy="130" r="11" fill="#F5E8D9" stroke="#C96B46" strokeWidth="1.5" />
      <path d="M273 166v48" stroke="#F4B78A" strokeWidth="2" strokeLinecap="round" />
    </g>
    <g transform="rotate(9 303 78)" filter="url(#shadow)"><rect x="282" y="57" width="43" height="43" rx="13" fill="#FEFCF7" /><path d="m294 78 6 6 12-13" stroke="#6F8A6C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></g>
    <path d="M104 105h10m-5-5v10M305 206h8m-4-4v8" stroke="#BB8F71" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="127" cy="202" r="4" fill="#D99472" /><circle cx="292" cy="38" r="3" fill="#C1C4A4" />
    <path d="M111 157c-16 5-21 19-15 30" stroke="#B5B89F" strokeWidth="1.5" strokeLinecap="round" /><path d="m91 181 5 7 4-7" stroke="#B5B89F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function StoryCard({ navigate }: { navigate: Navigate }) {
  return <aside className="relative flex flex-col overflow-hidden rounded-2xl border border-[#eadfd2] bg-[#f4ebdf] px-7 pt-5 pb-7 sm:px-9">
    <div className="flex items-center gap-1.5 self-start rounded-full border border-[#d9c9b6] bg-white/35 px-2.5 py-1 text-[9px] font-semibold tracking-[1px] text-[#8e735d]"><Sparkles size={11} /> A LITTLE PEACE OF MIND</div>
    <KeyIllustration />
    <div className="mt-auto">
      <h2 className="text-[27px] leading-[1.25] font-semibold tracking-[-0.9px] text-[#49483d]">Forgotten happens.<br />We've got you.</h2>
      <p className="mt-3 max-w-[295px] text-[12px] leading-[1.8] text-[#888071]">A lost password shouldn’t mean a lost account. Get a secure reset link and make a fresh start.</p>
      <button onClick={() => navigate("/forgot-password")} className="mt-5 inline-flex items-center gap-2 text-[12px] font-semibold text-[#665849] transition hover:gap-3">Let’s get you back in <ArrowRight size={15} /></button>
    </div>
  </aside>;
}

function AuthForm({ register, navigate, onLogin }: { register: boolean; navigate: Navigate; onLogin: (token: string, account: Account) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(""); setBusy(true);
    try {
      const credentials = { username: String(form.get("username")), password: String(form.get("password")) };
      if (register) await api("/auth/register", { method: "POST", body: { ...credentials, email: form.get("email") || null } });
      const session = await api<{ token: string }>("/auth/login", { method: "POST", body: credentials });
      const account = await api<Account>("/me", { token: session.token });
      onLogin(session.token, account);
      navigate("/account");
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }

  return <section className="rounded-2xl border border-line bg-white p-6 sm:p-8">
    <div className="mb-7 grid grid-cols-2 rounded-lg bg-[#f3f4f6] p-1">
      {[{ label: "Sign in", path: "/", active: !register }, { label: "Create an account", path: "/register", active: register }].map(tab => <button key={tab.label} onClick={() => navigate(tab.path)} className={`rounded-md px-3 py-2.5 text-[12px] font-semibold transition ${tab.active ? "bg-white text-ink shadow-[0_1px_4px_#00000009]" : "text-muted hover:text-ink"}`} aria-pressed={tab.active}>{tab.label}</button>)}
    </div>
    <div className="mb-5 flex size-10 items-center justify-center rounded-xl border border-[#efe6df] bg-[#fcf6f1] text-accent">{register ? <UserRound size={19} /> : <ArrowDownLeft size={21} />}</div>
    <h2 className="text-[25px] font-semibold tracking-[-0.8px]">{register ? "Make yourself at home." : "Welcome back."}</h2>
    <p className="mt-2 text-[12px] leading-relaxed text-muted">{register ? "A little less worry. A space that’s all yours." : "A familiar place. A fresh start to your day."}</p>
    <form onSubmit={submit} className="mt-6 space-y-4">
      {error && <Notice>{error}</Notice>}
      <Field label="Username" name="username" icon={<UserRound size={16} />} placeholder="Enter your username" autoComplete="username" maxLength={80} required />
      {register && <Field label="Email address (optional)" name="email" type="email" icon={<Mail size={16} />} placeholder="you@example.com" autoComplete="email" hint="Add an email so you can recover your account." />}
      <PasswordField name="password" placeholder={register ? "Choose a strong password" : "Enter your password"} autoComplete={register ? "new-password" : "current-password"} minLength={register ? 8 : undefined} maxLength={1024} required />
      {register ? <p className="flex items-center gap-1.5 text-[11px] text-muted"><ShieldCheck size={13} /> At least 8 characters. Uniquely yours.</p> : <div className="flex justify-end"><button type="button" onClick={() => navigate("/forgot-password")} className="text-[11px] font-semibold text-accent hover:underline">Forgot password?</button></div>}
      <button className={primaryClass} disabled={busy}>{busy ? "Just a moment…" : register ? "Create your account" : "Sign in to your account"}{!busy && <ArrowRight size={15} />}</button>
    </form>
    <p className="mt-5 flex items-center justify-center gap-1.5 text-[10px] text-[#9298a1]"><LockKeyhole size={11} /> Your details stay yours. Always.</p>
  </section>;
}

function ForgotForm({ navigate }: { navigate: Navigate }) {
  const [sent, setSent] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api("/auth/password-reset", { method: "POST", body: identifier.includes("@") ? { email: identifier } : { username: identifier } });
      setSent(true);
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <section className="flex flex-col rounded-2xl border border-line bg-white p-7 sm:p-9">
    <button onClick={() => navigate("/")} className="mb-8 flex items-center gap-2 self-start text-[11px] font-medium text-muted hover:text-ink"><ArrowLeft size={14} /> Back to sign in</button>
    <div className={`mb-5 flex size-12 items-center justify-center rounded-2xl ${sent ? "bg-[#edf5ef] text-[#52775c]" : "bg-[#fcf1e9] text-accent"}`}>{sent ? <Send size={23} /> : <KeyRound size={23} />}</div>
    <h2 className="text-[25px] font-semibold tracking-[-0.8px]">{sent ? "Check your mailbox." : "A fresh start awaits."}</h2>
    <p className="mt-3 text-[12px] leading-[1.8] text-muted">{sent ? "If the account exists, a reset link is on its way" : "Forgot your password? It happens. Enter your username or email and we’ll help you get back in."}</p>
    {sent ? <div className="mt-7 space-y-4">
      <div className="rounded-xl border border-[#ece7df] bg-[#faf8f4] p-4"><p className="flex items-center gap-2 text-[12px] font-semibold"><Inbox size={16} className="text-accent" /> A mailbox, without the mail server.</p><p className="mt-2 text-[11px] leading-[1.8] text-muted">This is a demo, so your reset email is waiting in our built-in Mailbox. No real email is sent.</p></div>
      <button onClick={() => navigate(`/mailbox${identifier.includes("@") ? `?to=${encodeURIComponent(identifier)}` : ""}`)} className={primaryClass}>Open Mailbox <ArrowRight size={15} /></button>
      <button onClick={() => setSent(false)} className="w-full py-2 text-[11px] font-medium text-muted hover:text-ink">Try a different username or email</button>
    </div> : <form onSubmit={submit} className="mt-7 space-y-5">
      {error && <Notice>{error}</Notice>}
      <Field label="Username or email address" icon={<UserRound size={16} />} placeholder="you@example.com or your username" value={identifier} onChange={event => setIdentifier(event.target.value)} autoComplete="username" maxLength={254} required />
      <button disabled={busy} className={primaryClass}>{busy ? "Sending…" : "Send reset link"}<ArrowRight size={15} /></button>
    </form>}
    <p className="mt-auto flex items-center justify-center gap-1.5 pt-8 text-[10px] text-[#9298a1]"><ShieldCheck size={12} /> One secure link. One fresh start.</p>
  </section>;
}

function ResetForm({ navigate, onReset }: { navigate: Navigate; onReset: () => void }) {
  const token = new URLSearchParams(window.location.search).get("token");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    if (form.get("password") !== form.get("confirm")) { setError("Your passwords don’t match. Please try again."); return; }
    setBusy(true);
    try {
      await api("/auth/password-reset/confirm", { method: "POST", body: { token, new_password: form.get("password") } });
      onReset(); setDone(true);
      window.history.replaceState({}, "", "/reset");
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-line bg-white p-7 sm:p-9">
    <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-[#fcf1e9] text-accent">{done ? <CheckCheck size={24} /> : <LockKeyhole size={23} />}</div>
    <h2 className="text-[25px] font-semibold tracking-[-0.8px]">{done ? "All set. All yours." : "Choose a new password."}</h2>
    <p className="mt-3 text-[12px] leading-[1.8] text-muted">{done ? "Your password has been reset. Sign in with your new password and pick up where you left off." : "Make it something strong, and uniquely yours. Your new password needs at least 8 characters."}</p>
    {done ? <button onClick={() => navigate("/")} className={`${primaryClass} mt-8`}>Back to sign in <ArrowRight size={15} /></button> : !token ? <div className="mt-6 space-y-5"><Notice>This reset link is missing its token. Request a new link to get started.</Notice><button onClick={() => navigate("/forgot-password")} className={primaryClass}>Request a new reset link <ArrowRight size={15} /></button></div> : <form onSubmit={submit} className="mt-7 space-y-5">
      {error && <Notice>{error}</Notice>}
      <PasswordField label="New password" name="password" placeholder="At least 8 characters" autoComplete="new-password" minLength={8} maxLength={1024} required />
      <PasswordField label="Confirm new password" name="confirm" placeholder="One more time" autoComplete="new-password" minLength={8} maxLength={1024} required />
      <button disabled={busy} className={primaryClass}>{busy ? "Updating…" : "Reset password"}<ArrowRight size={15} /></button>
      <button type="button" onClick={() => navigate("/forgot-password")} className="w-full text-[11px] font-medium text-muted hover:text-ink">Need a new reset link?</button>
    </form>}
  </section>;
}

function AccountPage({ account, token, onUpdate }: { account: Account; token: string; onUpdate: (account: Account) => void }) {
  const [email, setEmail] = useState(account.email ?? "");
  const [emailStatus, setEmailStatus] = useState({ text: "", success: false });
  const [passwordStatus, setPasswordStatus] = useState({ text: "", success: false });
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);
  async function saveEmail(event: FormEvent) {
    event.preventDefault(); setSaving(true); setEmailStatus({ text: "", success: false });
    try {
      const updated = await api<Account>("/me", { method: "PATCH", token, body: { email: email || null } });
      onUpdate(updated); setEmail(updated.email ?? ""); setEmailStatus({ text: "Your email address has been updated.", success: true });
    } catch (error) { setEmailStatus({ text: errorText(error), success: false }); }
    finally { setSaving(false); }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setPasswordStatus({ text: "", success: false });
    if (form.get("new") !== form.get("confirm")) { setPasswordStatus({ text: "Your new passwords don’t match.", success: false }); return; }
    setChanging(true);
    try {
      await api("/me/password", { method: "POST", token, body: { current_password: form.get("current"), new_password: form.get("new") } });
      element.reset(); setPasswordStatus({ text: "Password updated. Your other sessions have been signed out.", success: true });
    } catch (error) { setPasswordStatus({ text: errorText(error), success: false }); }
    finally { setChanging(false); }
  }
  return <div className="grid gap-6 lg:grid-cols-2">
    <section className="self-start rounded-2xl border border-line bg-white p-7 sm:p-8">
      <div className="mb-6 flex items-center gap-4"><div className="flex size-13 items-center justify-center rounded-full bg-[#f5e9df] text-xl font-semibold text-[#a77352]">{account.username.charAt(0).toUpperCase()}</div><div><h2 className="text-lg font-semibold">{account.username}</h2><p className="mt-1 text-[11px] text-muted">Your personal Keyspace account</p></div></div>
      <div className="mb-6 border-t border-line pt-6"><h3 className="text-sm font-semibold">Email & recovery</h3><p className="mt-2 text-[12px] leading-relaxed text-muted">Your way back in, if you ever forget your password.</p></div>
      <form onSubmit={saveEmail} className="space-y-5">
        {emailStatus.text && <Notice success={emailStatus.success}>{emailStatus.text}</Notice>}
        {!account.email && <Notice>Add an email address to enable password recovery.</Notice>}
        <Field label="Email address" type="email" icon={<Mail size={16} />} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" hint="You can leave this blank, but password recovery won’t be available." />
        <button disabled={saving} className={primaryClass}>{saving ? "Saving…" : "Save changes"}<Check size={15} /></button>
      </form>
    </section>
    <section className="rounded-2xl border border-line bg-white p-7 sm:p-8">
      <div className="mb-5 flex size-10 items-center justify-center rounded-xl bg-[#fcf1e9] text-accent"><ShieldCheck size={21} /></div>
      <h2 className="text-xl font-semibold tracking-[-0.5px]">Keep it secure.</h2><p className="mt-2 text-[12px] leading-relaxed text-muted">A new password. The same peace of mind.</p>
      <form onSubmit={changePassword} className="mt-6 space-y-4">
        {passwordStatus.text && <Notice success={passwordStatus.success}>{passwordStatus.text}</Notice>}
        <PasswordField label="Current password" name="current" placeholder="Your current password" autoComplete="current-password" required maxLength={1024} />
        <PasswordField label="New password" name="new" placeholder="At least 8 characters" autoComplete="new-password" required minLength={8} maxLength={1024} />
        <PasswordField label="Confirm new password" name="confirm" placeholder="Enter your new password again" autoComplete="new-password" required minLength={8} maxLength={1024} />
        <button className={primaryClass} disabled={changing}>{changing ? "Updating…" : "Update password"}<ArrowRight size={15} /></button>
      </form>
    </section>
  </div>;
}

function MessageBody({ body, navigate }: { body: string; navigate: Navigate }) {
  return <div className="space-y-3 text-[12px] leading-[1.9] text-[#727985]">{body.split("\n\n").map((paragraph, index) => {
    try {
      const link = new URL(paragraph);
      if (link.pathname === "/reset" && link.searchParams.has("token")) return <button key={index} onClick={() => navigate(`/reset?token=${encodeURIComponent(link.searchParams.get("token")!)}`)} className={`${primaryClass} my-2 w-auto`}>Reset my password <ArrowRight size={14} /></button>;
    } catch {}
    return <p key={index} className="whitespace-pre-wrap break-words">{paragraph}</p>;
  })}</div>;
}

function MailboxPage({ account, navigate }: { account: Account | null; navigate: Navigate }) {
  const initialAddress = new URLSearchParams(window.location.search).get("to") ?? account?.email ?? "";
  const [address, setAddress] = useState(initialAddress);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loadedAddress, setLoadedAddress] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!initialAddress) return;
    let active = true;
    api<{ items: Message[] }>(`/outbox?to=${encodeURIComponent(initialAddress)}`).then(data => {
      if (active) { setMessages(data.items); setSelected(data.items[0]?.id ?? null); setLoadedAddress(initialAddress); }
    }).catch(error => { if (active) setError(errorText(error)); });
    return () => { active = false; };
  }, [initialAddress]);

  async function load(event?: FormEvent) {
    event?.preventDefault();
    if (!address.trim()) return;
    setError(""); setBusy(true);
    try {
      const data = await api<{ items: Message[] }>(`/outbox?to=${encodeURIComponent(address.trim())}`);
      setMessages(data.items); setSelected(data.items[0]?.id ?? null); setLoadedAddress(address.trim());
      window.history.replaceState({}, "", `/mailbox?to=${encodeURIComponent(address.trim())}`);
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  const current = messages.find(message => message.id === selected);

  return <div className="space-y-5">
    <div className="flex items-start gap-3 rounded-xl border border-[#eadfd2] bg-[#f8f1e8] px-5 py-4"><Sparkles size={17} className="mt-0.5 shrink-0 text-[#b38b66]" /><p className="text-[12px] leading-relaxed text-[#8b7967]"><strong className="font-semibold">A little make-believe. A fully working inbox.</strong> No real email is sent. Enter an address to read the messages this app has sent to it.</p></div>
    <section className="rounded-2xl border border-line bg-white p-5 sm:p-7">
      <form onSubmit={load} className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="flex-1"><Field label="Mailbox address" type="email" value={address} onChange={event => setAddress(event.target.value)} icon={<Mail size={16} />} placeholder="you@example.com" required /></div><button className={`${primaryClass} sm:w-auto`} disabled={busy}>{busy ? "Opening…" : "Open mailbox"}<ArrowRight size={15} /></button></form>
      {error && <div className="mt-4"><Notice>{error}</Notice></div>}
    </section>
    <section className="min-h-[350px] overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-6 py-4"><div className="flex items-center gap-2.5"><Inbox size={17} className="text-muted" /><h2 className="text-[13px] font-semibold">Inbox</h2><span className="rounded-md bg-[#f0f2f4] px-1.5 py-0.5 text-[10px] text-muted">{messages.length}</span></div><button onClick={() => load()} disabled={busy || !address.trim()} className="rounded-md p-1.5 text-muted hover:bg-gray-50 hover:text-ink disabled:opacity-40" aria-label="Refresh mailbox"><RefreshCw size={15} className={busy ? "animate-spin" : ""} /></button></div>
      {!messages.length ? <div className="flex min-h-[290px] flex-col items-center justify-center px-5 py-9 text-center"><div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-[#f5f4f0] text-[#a5aa97]"><Inbox size={27} strokeWidth={1.3} /></div><h3 className="text-[15px] font-semibold">{loadedAddress ? "A quiet inbox, for now." : "Your messages live here."}</h3><p className="mt-2 max-w-sm text-[12px] leading-relaxed text-muted">{loadedAddress ? `No messages for ${loadedAddress}. Request a password reset and your email will appear here.` : "Open a mailbox to find your reset link and get back to what matters."}</p><button onClick={() => navigate("/forgot-password")} className="mt-5 flex items-center gap-2 text-[12px] font-semibold text-accent">Request a reset link <ArrowRight size={14} /></button></div> : <div className="grid md:grid-cols-[230px_1fr]">
        <div className="border-b border-line md:border-r md:border-b-0">{messages.map(message => <button key={message.id} onClick={() => setSelected(message.id)} className={`w-full border-b border-line p-5 text-left transition ${selected === message.id ? "border-l-2 border-l-accent bg-[#fcf6f1]" : "hover:bg-gray-50"}`}><div className="flex items-center gap-2 text-[12px] font-semibold"><span className="size-1.5 rounded-full bg-accent" /> Keyspace</div><p className="mt-2 text-[11px] font-medium">{message.subject}</p><p className="mt-2 text-[10px] text-muted">{new Date(message.sent_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p></button>)}</div>
        {current && <article className="min-w-0 p-6 sm:p-8"><h3 className="text-lg font-semibold tracking-[-0.5px]">{current.subject}</h3><p className="mt-3 text-[11px] text-muted">To: <span className="text-ink">{current.to}</span></p><p className="mt-1 text-[10px] text-muted">{new Date(current.sent_at).toLocaleString()}</p><div className="my-5 border-t border-line" /><MessageBody body={current.body} navigate={navigate} /></article>}
      </div>}
    </section>
  </div>;
}

const features = [
  { icon: ShieldCheck, title: "Private by default", text: "Your passwords are never stored as plain text." },
  { icon: KeyRound, title: "A safer fresh start", text: "Single-use reset links. Only you get back in." },
  { icon: Fingerprint, title: "Always in your control", text: "Your details. Your password. Your space." },
];

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [token, setToken] = useState(localStorage.getItem("keyspace-token") ?? "");
  const [account, setAccount] = useState<Account | null>(null);
  const [checking, setChecking] = useState(Boolean(token));
  const [mobileMenu, setMobileMenu] = useState(false);
  const [help, setHelp] = useState(false);

  function navigate(next: string) {
    window.history.pushState({}, "", next);
    setPath(next.split("?")[0]); setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  useEffect(() => {
    if (!token) return;
    let active = true;
    api<Account>("/me", { token }).then(data => { if (active) setAccount(data); }).catch(() => {
      if (active) { localStorage.removeItem("keyspace-token"); setToken(""); setAccount(null); }
    }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [token]);
  useEffect(() => {
    if (!help) return;
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setHelp(false); }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [help]);
  function clearSession() {
    localStorage.removeItem("keyspace-token"); setToken(""); setAccount(null); setChecking(false);
  }
  async function signOut() {
    try { await api("/auth/logout", { method: "POST", token }); } catch {}
    clearSession(); navigate("/");
  }
  function signIn(nextToken: string, nextAccount: Account) {
    localStorage.setItem("keyspace-token", nextToken); setToken(nextToken); setAccount(nextAccount);
  }
  const mailbox = path === "/mailbox";
  const profile = path === "/account";
  const forgot = path === "/forgot-password";
  const reset = path === "/reset";
  const register = path === "/register";
  const accountView = profile && account;
  const heading = mailbox ? "Good things, delivered." : accountView ? "A space that’s all yours." : forgot || reset ? "Let’s get you back to you." : "Your account, in good hands.";
  const description = mailbox ? "Your built-in mailbox. All your messages, right where you need them." : accountView ? "A few personal details. A little extra peace of mind." : forgot || reset ? "A forgotten password is just a small detour. We’ll take it from here." : "A simpler, safer space to sign in, stay secure, and start fresh.";
  const breadcrumb = mailbox ? "Mailbox" : profile ? "Account settings" : forgot || reset ? "Password recovery" : "Account access";

  return <div className="min-h-screen bg-[#f8f9fb] font-sans text-ink antialiased">
    <aside className={`${mobileMenu ? "flex" : "hidden"} fixed inset-y-0 left-0 z-40 w-[226px] flex-col border-r border-line bg-white px-5 py-8 lg:flex`}>
      <button onClick={() => navigate("/")} aria-label="Keyspace home" className="ml-2 self-start"><Brand /></button>
      <div className="mt-13 px-3 text-[9px] font-semibold tracking-[1.6px] text-[#a0a5ad]">YOUR WORKSPACE</div>
      <nav className="mt-4 space-y-1.5" aria-label="Main navigation">
        {[
          { label: "Account access", icon: KeyRound, url: "/", active: !mailbox && !profile },
          { label: "Account settings", icon: UserRound, url: "/account", active: profile },
          { label: "Mailbox", icon: Mail, url: "/mailbox", active: mailbox },
        ].map(item => <button key={item.label} onClick={() => navigate(item.url)} aria-current={item.active ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-[12px] font-medium transition ${item.active ? "bg-[#2c333c] text-white shadow-sm" : "text-[#7d8490] hover:bg-[#f4f5f7] hover:text-ink"}`}><item.icon size={16} strokeWidth={1.7} />{item.label}{item.active ? <span className="ml-auto size-1.5 rounded-full bg-[#e79371]" /> : item.label === "Mailbox" ? <span className="ml-auto rounded border border-[#e7e9ed] px-1 py-0.5 text-[7px] font-semibold tracking-wide text-[#9399a3]">DEMO</span> : null}</button>)}
      </nav>
      <div className="mt-auto pt-14">
        <div className="mx-1 rounded-xl border border-[#edece7] bg-[#f9f9f5] p-4"><div className="mb-3 flex size-8 items-center justify-center rounded-full bg-[#edeee5] text-[#7f8b70]"><ShieldCheck size={17} strokeWidth={1.6} /></div><h3 className="text-[12px] font-semibold">You’re in a safe place.</h3><p className="mt-2 text-[10px] leading-[1.8] text-[#94998e]">Thoughtful security.<br />One less thing to worry about.</p></div>
        <button onClick={() => setHelp(true)} className="mt-5 flex w-full items-center gap-2.5 px-3 py-2 text-[11px] text-muted hover:text-ink"><CircleHelp size={15} /> A little help <ChevronRight size={13} className="ml-auto" /></button>
        <div className="mx-3 mt-5 border-t border-line pt-5 text-[9px] text-[#a4a9b1]">A little security goes a long way.</div>
      </div>
    </aside>
    {mobileMenu && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/25 lg:hidden" onClick={() => setMobileMenu(false)} />}
    <div className="flex min-h-screen flex-col lg:ml-[226px]">
      <header className="flex h-[77px] shrink-0 items-center justify-between border-b border-line bg-white/75 px-5 sm:px-9 lg:px-12">
        <div className="flex items-center gap-3 text-[11px]"><button aria-label="Open navigation" onClick={() => setMobileMenu(true)} className="p-1 lg:hidden"><Menu size={20} /></button><span className="hidden text-muted sm:inline">Workspace</span><ChevronRight size={12} className="hidden text-[#bcc0c7] sm:block" /><span className="font-medium">{breadcrumb}</span></div>
        <div className="flex items-center gap-5"><span className="hidden items-center gap-1.5 text-[10px] text-[#92998e] sm:flex"><span className="size-1.5 rounded-full bg-[#85a17a]" /> All systems secure</span>{account ? <div className="flex items-center gap-2.5"><span className="flex size-7 items-center justify-center rounded-full bg-[#eee9e1] text-[11px] font-semibold text-[#927656]">{account.username[0].toUpperCase()}</span><span className="max-w-28 truncate text-[11px] font-medium">{account.username}</span><button onClick={signOut} className="rounded p-1.5 text-muted hover:bg-gray-100 hover:text-ink" aria-label="Sign out" title="Sign out"><LogOut size={15} /></button></div> : <span className="flex items-center gap-2 text-[11px] text-muted"><span className="flex size-7 items-center justify-center rounded-full border border-line bg-white"><UserRound size={14} /></span> Your personal space <ChevronDown size={11} /></span>}</div>
      </header>
      <main className="mx-auto w-full max-w-[1260px] flex-1 px-5 pt-9 pb-10 sm:px-9 lg:px-12 lg:pt-12">
        <div className="mb-8 lg:mb-9"><div className="mb-3 flex items-center gap-2 text-[9px] font-semibold tracking-[1.8px] text-accent"><span className="h-px w-5 bg-accent" /> {mailbox ? "A NOTE FOR YOU" : accountView ? "MAKE YOURSELF AT HOME" : "WELCOME TO KEYSPACE"}</div><h1 className="text-[29px] leading-tight font-semibold tracking-[-1.3px] sm:text-[35px] lg:text-[36px]">{heading}</h1><p className="mt-3 text-[12px] leading-relaxed text-[#89909a] sm:text-[13px]">{description}</p></div>
        {checking ? <div role="status" className="flex h-80 items-center justify-center gap-3 rounded-2xl border border-line bg-white text-sm text-muted"><RefreshCw size={18} className="animate-spin" /> Getting your space ready…</div> : mailbox ? <MailboxPage account={account} navigate={navigate} /> : accountView ? <AccountPage key={account.id} account={account} token={token} onUpdate={setAccount} /> : <div className="grid gap-6 md:grid-cols-[1.08fr_1fr]">
          {forgot ? <ForgotForm navigate={navigate} /> : reset ? <ResetForm navigate={navigate} onReset={clearSession} /> : <AuthForm key={register ? "register" : "login"} register={register} navigate={navigate} onLogin={signIn} />}
          <StoryCard navigate={navigate} />
        </div>}
        {!mailbox && <section className="mt-9 grid gap-6 border-t border-line pt-7 sm:grid-cols-3 sm:gap-5" aria-label="Our approach to security">{features.map((feature, index) => <div key={feature.title} className={`flex gap-3 ${index ? "sm:border-l sm:border-line sm:pl-5" : ""}`}><feature.icon size={19} strokeWidth={1.5} className="mt-0.5 shrink-0 text-[#959b91]" /><div><h3 className="text-[11px] font-semibold text-[#606772]">{feature.title}</h3><p className="mt-1.5 max-w-[190px] text-[10px] leading-[1.8] text-[#969ca5]">{feature.text}</p></div></div>)}</section>}
      </main>
      <footer className="mx-5 flex flex-wrap items-center justify-between gap-3 border-t border-line py-5 text-[9px] text-[#a0a6af] sm:mx-9 lg:mx-12"><span>© {new Date().getFullYear()} Keyspace. A little more peace of mind.</span><div className="flex items-center gap-5"><span className="flex items-center gap-1.5"><Shield size={11} /> Secure by design</span><button onClick={() => setHelp(true)} className="hover:text-ink">About this demo <span className="ml-1">↗</span></button></div></footer>
    </div>
    {help && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#20252d]/35 p-5 backdrop-blur-sm" onClick={() => setHelp(false)}><section role="dialog" aria-modal="true" aria-labelledby="help-title" className="relative w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-xl" onClick={event => event.stopPropagation()}><button aria-label="Close help" autoFocus onClick={() => setHelp(false)} className="absolute top-4 right-4 rounded p-1 text-muted hover:bg-gray-50"><X size={18} /></button><div className="mb-6"><Brand /></div><h2 id="help-title" className="text-xl font-semibold tracking-tight">A fresh start, in three steps.</h2><ol className="mt-6 space-y-5">{["Create an account with an email address.", "Forgot your password? Request a secure reset link.", "Open Mailbox with that email address, then follow your reset link."].map((text, index) => <li key={text} className="flex items-start gap-3 text-[12px] leading-relaxed text-muted"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#fcf1e9] text-[10px] font-semibold text-accent">{index + 1}</span>{text}</li>)}</ol><p className="mt-6 border-t border-line pt-5 text-[11px] leading-relaxed text-muted">No real emails are sent. Reset links expire after one hour and work only once. Your account and messages are saved between visits.</p><button onClick={() => setHelp(false)} className={`${primaryClass} mt-6`}>Got it <Check size={15} /></button></section></div>}
  </div>;
}
