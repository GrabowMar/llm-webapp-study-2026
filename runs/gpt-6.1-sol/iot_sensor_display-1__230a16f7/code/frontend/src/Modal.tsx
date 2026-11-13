import { ArrowRight, Check, LoaderCircle, Plus, Radio, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { api, numberFormat } from "./types";
import type { Sensor, Session } from "./types";

export const inputClass = "w-full rounded-lg border border-line bg-white px-3.5 py-3 text-sm text-ink placeholder:text-[#abb1a5] focus:border-[#97aa88]";
export const primaryClass = "inline-flex items-center justify-center gap-2 rounded-lg bg-forest px-4 py-2.5 text-[12px] font-medium text-white transition-colors hover:bg-[#244831] disabled:opacity-50";

export function Modal({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const container = dialog.current;
    const controls = () => Array.from(container?.querySelectorAll<HTMLElement>("button:not([disabled]), input, select, a[href], [tabindex='0']") || []);
    (container?.querySelector<HTMLElement>("input") || controls()[0])?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key === "Tab") {
        const elements = controls();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener("keydown", keyboard); previous?.focus(); };
  }, []);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#152b24]/35 p-4 backdrop-blur-[3px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="modal-title" className="max-h-[90dvh] w-full max-w-[430px] overflow-y-auto rounded-2xl border border-white/50 bg-canvas p-7 shadow-2xl">
      <div className="mb-6 flex items-center justify-between"><div className="flex size-10 items-center justify-center rounded-xl bg-lime/50 text-forest"><Radio size={21} /></div><button aria-label="Close dialog" onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-line"><X size={18} /></button></div>
      <h2 id="modal-title" className="text-2xl font-semibold tracking-[-0.6px]">{title}</h2>
      {description && <p className="mb-6 mt-2 text-[13px] leading-relaxed text-muted">{description}</p>}
      {children}
    </div>
  </div>;
}

export function FormError({ error }: { error: string }) {
  return error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{error}</p> : null;
}

export function AuthModal({ mode, setMode, onClose, onLogin }: { mode: "login" | "register"; setMode: (mode: "login" | "register") => void; onClose: () => void; onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    let registered = false;
    try {
      const credentials = { username: username.trim(), password };
      if (mode === "register") {
        await api("/auth/register", { method: "POST", body: JSON.stringify(credentials) });
        registered = true;
      }
      const response = await api<{ token: string }>("/auth/login", { method: "POST", body: JSON.stringify(credentials) });
      onLogin({ token: response.token, username: credentials.username });
    } catch (exception) { setError(exception instanceof Error ? exception.message : "Unable to sign in."); if (registered) setMode("login"); }
    finally { setBusy(false); }
  };
  return <Modal title={mode === "login" ? "Welcome back." : "Make yourself at home."} description={mode === "login" ? "Sign in to look after your sensors and keep things connected." : "Create your free account and start connecting your environment."} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-2"><span className="text-xs font-medium">Username</span><input required maxLength={64} autoComplete="username" className={inputClass} placeholder="Your username" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
      <label className="block space-y-2"><span className="text-xs font-medium">Password</span><input required maxLength={256} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} className={inputClass} placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <FormError error={error} />
      <button disabled={busy} className={`${primaryClass} !mt-6 w-full !py-3`}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : null}{mode === "login" ? "Sign in" : "Create account"}{!busy && <ArrowRight size={15} />}</button>
    </form>
    <p className="mt-5 text-center text-xs text-muted">{mode === "login" ? "New to Fieldwork?" : "Already have an account?"} <button className="ml-1 font-medium text-forest underline-offset-4 hover:underline" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Create an account" : "Sign in"}</button></p>
  </Modal>;
}

export function SensorModal({ session, onClose, onCreated, onError }: { session: Session; onClose: () => void; onCreated: (sensor: Sensor) => void; onError: (error: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const sensor = await api<Sensor>("/sensors", { method: "POST", body: JSON.stringify({ name: form.get("name"), unit: form.get("unit"), location: form.get("location") }) }, session.token);
      onCreated(sensor);
    } catch (exception) { setError(exception instanceof Error ? exception.message : "Unable to register sensor."); onError(exception); }
    finally { setBusy(false); }
  };
  return <Modal title="Connect a new sensor." description="Give your sensor a name and a place. You can add its first reading right after." onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-2"><span className="text-xs font-medium">Sensor name <span className="text-muted">*</span></span><input name="name" required maxLength={120} placeholder="e.g. Greenhouse temperature" className={inputClass} /></label>
      <label className="block space-y-2"><span className="text-xs font-medium">Unit</span><input name="unit" maxLength={32} placeholder="e.g. °C, %, lux" className={inputClass} /></label>
      <label className="block space-y-2"><span className="text-xs font-medium">Location</span><input name="location" maxLength={160} placeholder="e.g. Greenhouse" className={inputClass} /></label>
      <div className="rounded-lg bg-[#edf1e6] p-3 text-xs text-[#758466]">Registered to <span className="font-medium text-forest">{session.username}</span>. Everyone can view readings; only you can manage this sensor.</div>
      <FormError error={error} />
      <button disabled={busy} className={`${primaryClass} w-full !py-3`}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}Register sensor</button>
    </form>
  </Modal>;
}

export function ReadingModal({ sensor, session, onClose, onSaved, onError }: { sensor: Sensor; session: Session; onClose: () => void; onSaved: () => void; onError: (error: unknown) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    const reading = Number(value);
    if (!value.trim() || !Number.isFinite(reading)) { setError("Enter a valid numeric reading."); return; }
    setBusy(true);
    try {
      await api(`/sensors/${sensor.id}/readings`, { method: "POST", body: JSON.stringify({ value: reading }) }, session.token);
      onSaved();
    } catch (exception) { setError(exception instanceof Error ? exception.message : "Unable to record reading."); onError(exception); }
    finally { setBusy(false); }
  };
  return <Modal title="A fresh reading." description={`Record the latest value for ${sensor.name}. The time is recorded automatically.`} onClose={onClose}>
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-lg border border-line bg-white px-4 py-3"><p className="text-xs text-muted">Current reading</p><p className="mt-1 text-xl font-medium">{sensor.last_value === null ? "—" : numberFormat(sensor.last_value)} <span className="text-sm text-muted">{sensor.unit}</span></p></div>
      <label className="block space-y-2"><span className="text-xs font-medium">New value {sensor.unit && `(${sensor.unit})`}</span><input required type="number" step="any" placeholder="Enter a reading" value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} /></label>
      <FormError error={error} />
      <button disabled={busy} className={`${primaryClass} w-full !py-3`}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}Record reading</button>
    </form>
  </Modal>;
}

export function DeleteModal({ sensor, session, onClose, onDeleted, onError }: { sensor: Sensor; session: Session; onClose: () => void; onDeleted: () => void; onError: (error: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const remove = async () => {
    setBusy(true); setError("");
    try { await api(`/sensors/${sensor.id}`, { method: "DELETE" }, session.token); onDeleted(); }
    catch (exception) { setError(exception instanceof Error ? exception.message : "Unable to delete sensor."); onError(exception); }
    finally { setBusy(false); }
  };
  return <Modal title="Delete this sensor?" description={`“${sensor.name}” and all of its readings will be permanently deleted. This action can’t be undone.`} onClose={onClose}>
    <FormError error={error} />
    <div className="mt-6 flex gap-3"><button onClick={onClose} className="flex-1 rounded-lg border border-line bg-white px-4 py-3 text-xs font-medium">Keep sensor</button><button onClick={remove} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#a8483c] px-4 py-3 text-xs font-medium text-white hover:bg-[#943c32] disabled:opacity-50">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}Delete sensor</button></div>
  </Modal>;
}
