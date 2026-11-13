import { useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError, errorMessage } from "../api";
import type { FieldErrors } from "../api";
import Brand from "./Brand";
import Icon from "./Icon";

export default function Auth({ onSignIn }: { onSignIn: (token: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<FieldErrors>({});
  const register = mode === "register";

  function changeMode(next: "login" | "register") {
    setMode(next);
    setError("");
    setFields({});
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    let created = false;
    try {
      const body = { username, password };
      if (register) {
        await api("/auth/register", null, { method: "POST", body });
        created = true;
      }
      const { token } = await api<{ token: string }>("/auth/login", null, { method: "POST", body });
      onSignIn(token);
    } catch (error) {
      if (created) setMode("login");
      setError(created ? `Your account was created. ${errorMessage(error)}` : errorMessage(error));
      if (error instanceof ApiError) setFields(error.fields);
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "mt-2 w-full rounded-lg border border-line bg-white px-3.5 py-3 text-sm transition placeholder:text-[#a1a69e] focus:border-leaf focus:ring-2 focus:ring-leaf/10 disabled:opacity-60";

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <header className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-6 py-7 sm:px-12">
        <Brand />
        <span className="hidden items-center gap-2 text-xs text-muted sm:flex"><Icon name="leaf" className="size-4 text-leaf" /> A little more headspace.</span>
      </header>
      <main className="mx-auto grid w-full max-w-[1100px] flex-1 items-center gap-12 px-6 py-12 md:grid-cols-[1.15fr_1fr] md:gap-16 md:py-16">
        <section className="relative">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#dce8d6] bg-mint px-3.5 py-1.5 text-[11px] font-semibold tracking-[1.5px] text-leaf"><Icon name="sun" className="size-3.5" /> YOUR DAY, A LITTLE LIGHTER</div>
          <h1 className="text-[44px] leading-[1.13] font-semibold tracking-[-2.3px] sm:text-[58px]">Less on your mind.<br />More in your <span className="text-leaf">day.</span></h1>
          <p className="mt-6 max-w-[390px] text-[15px] leading-7 text-muted">A simple home for everything you need to do. Find your focus, take it one task at a time, and enjoy a little more breathing room.</p>
          <div className="mt-9 space-y-4">
            {[
              { icon: "lock" as const, title: "Just for you", text: "Your tasks. Your own private space." },
              { icon: "flag" as const, title: "Focus on what matters", text: "Clear priorities, without the clutter." },
              { icon: "circleCheck" as const, title: "Small steps, real progress", text: "Every checkmark is a little win." },
            ].map((feature) => (
              <div key={feature.title} className="flex items-center gap-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#e0e8db] bg-mint text-leaf"><Icon name={feature.icon} className="size-[18px]" /></span>
                <div><h2 className="text-[13px] font-semibold">{feature.title}</h2><p className="mt-0.5 text-xs text-muted">{feature.text}</p></div>
              </div>
            ))}
          </div>
          <div className="mt-10 flex items-center gap-3 text-xs text-muted"><span className="h-px w-8 bg-[#ccd8c5]" /> Less busy. More intentional.</div>
        </section>
        <section className="rounded-2xl border border-line bg-white p-6 shadow-[0_12px_60px_-20px_rgba(40,65,40,0.13)] sm:p-9">
          <div className="mb-8 flex rounded-lg bg-[#f3f5f0] p-1" aria-label="Account options">
            {(["login", "register"] as const).map((value) => (
              <button key={value} disabled={busy} onClick={() => changeMode(value)} aria-pressed={mode === value} className={`flex-1 rounded-md py-2.5 text-xs font-semibold transition ${mode === value ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
                {value === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
          <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-mint text-leaf"><Icon name={register ? "sparkles" : "leaf"} className="size-5" /></span>
          <h2 className="text-2xl font-semibold tracking-[-0.8px]">{register ? "A fresh start awaits." : "Welcome back."}</h2>
          <p className="mt-2 text-sm text-muted">{register ? "Make a little space for what matters." : "Let’s make a little room for a good day."}</p>
          <form className="mt-7 space-y-5" onSubmit={submit} noValidate>
            <div>
              <label htmlFor="username" className="text-xs font-semibold">Username</label>
              <input id="username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Your username" className={inputClass} disabled={busy} aria-invalid={!!fields.username} aria-describedby={fields.username ? "username-error" : undefined} />
              {fields.username && <p id="username-error" className="mt-1.5 text-xs text-red-600">{fields.username}</p>}
            </div>
            <div>
              <label htmlFor="password" className="text-xs font-semibold">Password</label>
              <div className="relative">
                <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={register ? "At least 8 characters" : "Your password"} className={`${inputClass} pr-11`} disabled={busy} aria-invalid={!!fields.password} aria-describedby={fields.password ? "password-error" : undefined} />
                <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-2 mt-2 flex w-8 items-center justify-center rounded text-muted hover:text-ink"><Icon name={showPassword ? "eyeOff" : "eye"} className="size-[18px]" /></button>
              </div>
              {fields.password && <p id="password-error" className="mt-1.5 text-xs text-red-600">{fields.password}</p>}
              {register && !fields.password && <p className="mt-2 text-[11px] text-muted">8–128 characters. Make it uniquely yours.</p>}
            </div>
            {error && <p role="alert" className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-700">{error}</p>}
            <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-leaf py-3.5 text-sm font-medium text-white transition hover:bg-[#2f6848] disabled:opacity-60">{busy ? "Just a moment…" : register ? "Create your account" : "Sign in to your space"}{!busy && <Icon name="arrow" className="size-4" />}</button>
          </form>
          <div className="mt-7 border-t border-line pt-5 text-center text-xs text-muted">
            {register ? "Already have a little space here? " : "New here? "}
            <button disabled={busy} onClick={() => changeMode(register ? "login" : "register")} className="font-semibold text-leaf hover:underline">{register ? "Sign in" : "Create an account"}</button>
          </div>
          <div className="mt-5 flex items-center justify-center gap-1.5 text-[10px] text-muted"><Icon name="lock" className="size-3" /> Your list is private. Always.</div>
        </section>
      </main>
      <footer className="px-6 py-6 text-center text-[11px] text-muted">Made for a little less chaos, and a little more you.</footer>
    </div>
  );
}
