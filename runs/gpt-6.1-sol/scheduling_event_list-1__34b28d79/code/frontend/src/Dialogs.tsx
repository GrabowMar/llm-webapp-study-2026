import { useId, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { AlertCircle, ArrowRight, CalendarDays, Clock3, Eye, EyeOff, Globe2, Loader2, LockKeyhole, MapPin, Pencil, Trash2 } from "lucide-react";
import type { CalendarEvent, EventInput, FieldErrors } from "./lib";
import { ApiError, api, eventInitials, formatDate, inputDateTime, timeLabel } from "./lib";
import { GatherMark, Modal, inputClass, primaryButton, secondaryButton } from "./ui";

function ErrorMessage({ message }: { message: string }) {
  if (!message) return null;
  return <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700"><AlertCircle className="mt-0.5 shrink-0" size={15} />{message}</div>;
}

function Field({ label, error, id, children }: { label: string; error?: string; id: string; children: ReactNode }) {
  return <div>
    <label htmlFor={id} className="mb-2 block text-xs font-semibold text-ink">{label}</label>
    {children}
    {error && <p id={`${id}-error`} className="mt-1.5 text-xs text-red-600">{error}</p>}
  </div>;
}

export function AuthDialog({ initialMode, onClose, onAuthenticated }: { initialMode: "login" | "register"; onClose: () => void; onAuthenticated: (token: string, username: string) => void }) {
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<FieldErrors>({});
  const id = useId();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    try {
      const body = JSON.stringify({ username, password });
      if (mode === "register") await api("/auth/register", { method: "POST", body });
      const data = await api<{ token: string }>("/auth/login", { method: "POST", body });
      onAuthenticated(data.token, username.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in. Please try again.");
      if (err instanceof ApiError) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }
  return <Modal title={mode === "login" ? "Welcome back" : "A little more together"} onClose={() => { if (!busy) onClose(); }}>
    <div className="px-6 py-6">
      <div className="mb-6 flex items-start gap-3.5">
        <GatherMark className="size-11 shrink-0 text-forest" />
        <div><h3 className="text-sm font-semibold">{mode === "login" ? "Good to see you again." : "Good plans start here."}</h3><p className="mt-1 text-xs leading-relaxed text-muted">{mode === "login" ? "Sign in to create, edit, and share your next plan." : "Create an account and help bring the calendar to life."}</p></div>
      </div>
      <div className="mb-6 flex rounded-lg bg-sage/70 p-1">
        {(["login", "register"] as const).map(tab => <button key={tab} type="button" disabled={busy} onClick={() => { setMode(tab); setError(""); setFields({}); }} className={`flex-1 rounded-md py-2 text-xs font-medium ${mode === tab ? "bg-white text-forest shadow-sm" : "text-muted hover:text-ink"}`}>{tab === "login" ? "Sign in" : "Create account"}</button>)}
      </div>
      <form onSubmit={submit} noValidate className="space-y-5">
        <ErrorMessage message={error} />
        <Field id={`${id}-username`} label="Username" error={fields.username}>
          <input id={`${id}-username`} className={inputClass} value={username} onChange={event => setUsername(event.target.value)} placeholder="Your username" autoComplete="username" disabled={busy} aria-invalid={!!fields.username} aria-describedby={fields.username ? `${id}-username-error` : undefined} />
        </Field>
        <Field id={`${id}-password`} label="Password" error={fields.password}>
          <div className="relative">
            <input id={`${id}-password`} className={`${inputClass} pr-11`} type={showPassword ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === "register" ? "Choose a password" : "Your password"} autoComplete={mode === "register" ? "new-password" : "current-password"} disabled={busy} aria-invalid={!!fields.password} aria-describedby={fields.password ? `${id}-password-error` : undefined} />
            <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)} className="absolute top-0 right-0 flex h-full w-11 items-center justify-center rounded-r-lg text-muted hover:text-forest">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
        </Field>
        <button disabled={busy} className={`${primaryButton} w-full py-3!`}>{busy ? <Loader2 size={16} className="animate-spin" /> : null}{mode === "login" ? "Sign in" : "Create your account"}{!busy && <ArrowRight size={16} />}</button>
      </form>
      <div className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-muted"><LockKeyhole size={11} />Your password is private. Your plans are shared.</div>
    </div>
  </Modal>;
}

export function EventFormDialog({ event, date, token, onClose, onSaved }: { event?: CalendarEvent; date: Date; token: string; onClose: () => void; onSaved: (event: CalendarEvent, edited: boolean) => void }) {
  const initial = new Date(date);
  if (initial.getUTCHours() === 0 && initial.getUTCMinutes() === 0) initial.setUTCHours(9);
  const [values, setValues] = useState({
    title: event?.title || "",
    description: event?.description || "",
    location: event?.location || "",
    start_time: inputDateTime(event?.start_time || initial),
    end_time: inputDateTime(event?.end_time || new Date(initial.getTime() + 3_600_000)),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<FieldErrors>({});
  const id = useId();
  const update = (field: keyof typeof values, value: string) => setValues(previous => ({ ...previous, [field]: value }));
  const accessibility = (field: string) => ({ "aria-invalid": !!fields[field], "aria-describedby": fields[field] ? `${id}-${field}-error` : undefined });
  async function submit(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    try {
      const body: EventInput = { ...values, start_time: values.start_time ? `${values.start_time}:00Z` : "", end_time: values.end_time ? `${values.end_time}:00Z` : "", description: values.description || null, location: values.location || null };
      const saved = await api<CalendarEvent>(event ? `/events/${event.id}` : "/events", { method: event ? "PUT" : "POST", body: JSON.stringify(body) }, token);
      onSaved(saved, !!event);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save your event.");
      if (err instanceof ApiError) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  }
  return <Modal title={event ? "Edit event" : "Create an event"} wide onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={submit} noValidate>
      <div className="space-y-5 p-6">
        <p className="text-xs leading-relaxed text-muted">{event ? "A change of plans? Keep everyone in the loop." : "Make time for something good. Everyone can see your event."}</p>
        <ErrorMessage message={error} />
        <Field id={`${id}-title`} label="Event title *" error={fields.title}>
          <input id={`${id}-title`} className={inputClass} placeholder="What’s the plan?" value={values.title} onChange={e => update("title", e.target.value)} disabled={busy} {...accessibility("title")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${id}-start_time`} label="Starts *" error={fields.start_time}>
            <input id={`${id}-start_time`} className={`${inputClass} min-w-0 text-xs!`} type="datetime-local" value={values.start_time} onChange={e => update("start_time", e.target.value)} disabled={busy} {...accessibility("start_time")} />
          </Field>
          <Field id={`${id}-end_time`} label="Ends *" error={fields.end_time}>
            <input id={`${id}-end_time`} className={`${inputClass} min-w-0 text-xs!`} type="datetime-local" value={values.end_time} onChange={e => update("end_time", e.target.value)} disabled={busy} {...accessibility("end_time")} />
          </Field>
        </div>
        <p className="-mt-2 flex items-center gap-1.5 text-[10px] text-muted"><Globe2 size={12} />All dates and times are in UTC.</p>
        <Field id={`${id}-location`} label="Location" error={fields.location}>
          <div className="relative"><MapPin size={15} className="pointer-events-none absolute top-3.5 left-3.5 text-muted" /><input id={`${id}-location`} className={`${inputClass} pl-10`} placeholder="A place, a link, or somewhere in between" value={values.location} onChange={e => update("location", e.target.value)} disabled={busy} {...accessibility("location")} /></div>
        </Field>
        <Field id={`${id}-description`} label="Description" error={fields.description}>
          <textarea id={`${id}-description`} rows={3} className={`${inputClass} resize-y`} placeholder="Anything everyone should know?" value={values.description} onChange={e => update("description", e.target.value)} disabled={busy} {...accessibility("description")} />
        </Field>
        <div className="flex items-center gap-2 rounded-lg bg-sage/60 px-3 py-2.5 text-[10px] text-forest"><Globe2 size={13} /><span>This is a shared event. Any signed-in member can edit it.</span></div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line bg-white px-6 py-4"><button type="button" className={secondaryButton} disabled={busy} onClick={onClose}>Cancel</button><button className={primaryButton} disabled={busy}>{busy && <Loader2 size={15} className="animate-spin" />}{event ? "Save changes" : "Create event"}{!busy && <ArrowRight size={15} />}</button></div>
    </form>
  </Modal>;
}

export function EventDetailDialog({ event, token, onClose, onEdit, onDeleted, onSignIn }: { event: CalendarEvent; token: string; onClose: () => void; onEdit: () => void; onDeleted: () => void; onSignIn: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api(`/events/${event.id}`, { method: "DELETE" }, token);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete the event.");
    } finally {
      setBusy(false);
    }
  }
  return <Modal title={confirmDelete ? "Delete this event?" : "Event details"} onClose={() => { if (!busy) onClose(); }}>
    {confirmDelete ? <div className="p-6">
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-red-50 text-red-600"><Trash2 size={21} /></div>
      <p className="text-sm leading-relaxed">“<span className="font-semibold">{event.title}</span>” will be removed from everyone’s calendar. This can’t be undone.</p>
      <div className="mt-4"><ErrorMessage message={error} /></div>
      <div className="mt-6 flex justify-end gap-2"><button className={secondaryButton} disabled={busy} onClick={() => { setConfirmDelete(false); setError(""); }}>Keep event</button><button disabled={busy} onClick={remove} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60">{busy ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}Delete event</button></div>
    </div> : <>
      <div className="p-6">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sage px-2.5 py-1 text-[10px] font-medium text-forest"><span className="size-1.5 rounded-full bg-forest" />Shared calendar</span>
        <h3 className="mt-4 text-2xl font-semibold leading-snug tracking-tight">{event.title}</h3>
        <div className="mt-6 space-y-5">
          <div className="flex items-start gap-3"><CalendarDays size={17} className="mt-0.5 shrink-0 text-muted" /><div><p className="text-xs font-medium">{formatDate(event.start_time, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p><p className="mt-1.5 text-xs text-muted">{timeLabel(event.start_time)} – {new Date(event.start_time).toISOString().slice(0, 10) !== new Date(event.end_time).toISOString().slice(0, 10) ? `${formatDate(event.end_time, { month: "short", day: "numeric" })}, ` : ""}{timeLabel(event.end_time)} <span className="ml-1 text-[10px]">UTC</span></p></div></div>
          {event.location && <div className="flex items-start gap-3"><MapPin size={17} className="shrink-0 text-muted" /><p className="text-xs leading-relaxed break-words">{event.location}</p></div>}
          {event.description && <div className="border-t border-line pt-5"><h4 className="mb-2 text-[10px] font-semibold tracking-wider text-muted uppercase">The details</h4><p className="text-xs leading-6 break-words whitespace-pre-wrap">{event.description}</p></div>}
        </div>
        <div className="mt-6 flex items-center gap-2.5 border-t border-line pt-4"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sage text-[10px] font-semibold text-forest">{eventInitials(event.created_by)}</span><div className="min-w-0"><p className="truncate text-[11px]">Created by <span className="font-semibold">{event.created_by}</span></p><p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted"><Clock3 size={10} />{formatDate(event.created_at, { month: "short", day: "numeric", year: "numeric" })}</p></div></div>
      </div>
      <div className="flex items-center justify-between border-t border-line bg-white px-6 py-4">{token ? <><button onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 rounded-md p-1.5 text-xs text-red-600 hover:bg-red-50"><Trash2 size={14} />Delete</button><button onClick={onEdit} className={primaryButton}><Pencil size={14} />Edit event</button></> : <><span className="text-[10px] text-muted">Make a change of plans?</span><button onClick={onSignIn} className={primaryButton}>Sign in to edit<ArrowRight size={14} /></button></>}</div>
    </>}
  </Modal>;
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return <Modal title="A shared space for your plans" onClose={onClose}>
    <div className="space-y-5 p-6 text-xs leading-relaxed">
      <p className="text-muted">Gather brings everyone’s plans into one place. Browse freely, or create an account to add, edit, and delete events. All times are shown in UTC.</p>
      <h3 className="font-semibold">A few handy shortcuts</h3>
      <div className="space-y-2.5">{[["Today", "T"], ["Previous / next period", "← / →"], ["Month / week / day", "M / W / D"], ["New event", "N"], ["Search events", "/"], ["Close dialog", "Esc"]].map(([label, key]) => <div key={label} className="flex items-center justify-between"><span className="text-muted">{label}</span><kbd className="rounded border border-line bg-white px-2 py-1 text-[10px] text-ink">{key}</kbd></div>)}</div>
      <button className={`${primaryButton} w-full`} onClick={onClose}>Got it<ArrowRight size={14} /></button>
    </div>
  </Modal>;
}
