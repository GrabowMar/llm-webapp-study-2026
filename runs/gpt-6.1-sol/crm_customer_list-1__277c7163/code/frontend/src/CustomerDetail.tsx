import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { ArrowLeft, Building2, CalendarDays, Clock3, FileText, LoaderCircle, Mail, MessageSquare, Pencil, Phone, Plus, ShieldCheck, Trash2, Users, Video } from "lucide-react";
import { api, ApiError, date, initials, message, type Customer, type Interaction } from "./api";
import { CustomerForm } from "./CustomerForm";
import type { LayoutContext } from "./Layout";
import { Alert, Field, inputClass, Modal, primaryButton, secondaryButton, Spinner } from "./ui";

const kinds = {
  call: { label: "Call", icon: Phone, color: "bg-brand-50 text-brand-600" },
  email: { label: "Email", icon: Mail, color: "bg-[#ecf2fa] text-[#6a8cba]" },
  meeting: { label: "Meeting", icon: Video, color: "bg-[#f1eef8] text-[#8b79b4]" },
};

function localDateTime() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function InteractionForm({ customerId, onSaved }: { customerId: number; onSaved: () => void }) {
  const [kind, setKind] = useState<Interaction["kind"]>("call");
  const [summary, setSummary] = useState("");
  const [occurredAt, setOccurredAt] = useState(localDateTime);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setErrors({});
    try {
      const parsedDate = new Date(occurredAt);
      await api(`/customers/${customerId}/interactions`, {
        method: "POST",
        body: JSON.stringify({ kind, summary, occurred_at: Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString() }),
      });
      setSummary(""); setOccurredAt(localDateTime()); onSaved();
    } catch (err) { setError(message(err)); if (err instanceof ApiError) setErrors(err.errors); }
    finally { setBusy(false); }
  }
  return <section className="rounded-xl border border-slate-200/80 bg-white"><div className="border-b border-slate-100 px-5 py-4"><h2 className="flex items-center gap-2 text-sm font-semibold"><Plus size={16} className="text-brand-600" />Log an interaction</h2><p className="mt-1.5 text-xs text-slate-400">A quick note now. Helpful context later.</p></div><form onSubmit={submit} noValidate className="space-y-5 p-5">
    {error && <Alert>{error}</Alert>}
    <fieldset><legend className="mb-2 text-xs font-medium text-slate-600">Interaction type</legend><div className="grid grid-cols-3 gap-2">{Object.entries(kinds).map(([key, { label, icon: Icon }]) => <label key={key} className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 text-xs transition ${kind === key ? "border-brand-200 bg-brand-50 font-medium text-brand-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}><input type="radio" name="kind" value={key} checked={kind === key} onChange={() => setKind(key as Interaction["kind"])} disabled={busy} className="sr-only" /><Icon size={14} /><span>{label}</span></label>)}</div>{errors.kind && <p role="alert" className="mt-1 text-xs text-red-600">{errors.kind}</p>}</fieldset>
    <Field id="interaction-summary" label="What did you talk about?" required error={errors.summary}><textarea id="interaction-summary" rows={5} placeholder="A follow-up, an introduction, a useful detail…" value={summary} onChange={(event) => setSummary(event.target.value)} disabled={busy} className={`${inputClass} resize-y text-xs leading-6`} aria-invalid={!!errors.summary} aria-describedby={errors.summary ? "interaction-summary-error" : undefined} /></Field>
    <Field id="interaction-date" label="When did it happen?" required error={errors.occurred_at} hint="Date and time in your local timezone."><input id="interaction-date" type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} disabled={busy} className={`${inputClass} text-xs`} aria-invalid={!!errors.occurred_at} aria-describedby={errors.occurred_at ? "interaction-date-error" : undefined} /></Field>
    <button disabled={busy} className={`${primaryButton} w-full`}>{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}{busy ? "Logging…" : "Log interaction"}</button>
    <p className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400"><ShieldCheck size={12} />Logged as you. Visible to the whole team.</p>
  </form></section>;
}

export function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify } = useOutletContext<LayoutContext>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(false);
  const [remove, setRemove] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    Promise.all([api<Customer>(`/customers/${id}`), api<{ items: Interaction[] }>(`/customers/${id}/interactions`)]).then(([data, log]) => {
      if (active) { setCustomer(data); setInteractions(log.items); }
    }).catch((err) => { if (active) setError(message(err)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, revision]);
  async function deleteCustomer() {
    setDeleting(true); setDeleteError("");
    try { await api(`/customers/${id}`, { method: "DELETE" }); notify("Customer and interaction history deleted."); navigate("/customers"); }
    catch (err) { setDeleteError(message(err)); }
    finally { setDeleting(false); }
  }
  if (loading) return <Spinner label="Opening this customer’s profile…" />;
  if (error || !customer) return <div className="space-y-5"><Link to="/customers" className="inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft size={15} />Back to customers</Link><Alert>{error || "Customer not found."}</Alert><button onClick={() => { setLoading(true); setRevision(revision + 1); }} className={secondaryButton}>Try again</button></div>;
  return <>
    <Link to="/customers" className="mb-7 inline-flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-brand-700"><ArrowLeft size={14} />Back to customers</Link>
    <div className="mb-8 flex flex-wrap items-center justify-between gap-5"><div className="flex min-w-0 items-center gap-4"><span className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-brand-100 bg-brand-50 text-xl font-medium text-brand-700">{initials(customer.name)}</span><div className="min-w-0"><p className="mb-1 text-[10px] font-semibold tracking-[1.5px] text-brand-600">CUSTOMER PROFILE</p><h1 className="break-words text-[28px] font-semibold tracking-[-0.8px]">{customer.name}</h1><p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400"><Building2 size={13} />{customer.company || "No company added"}</p></div></div><div className="flex gap-2"><button onClick={() => setEdit(true)} className={secondaryButton}><Pencil size={15} />Edit customer</button><button onClick={() => { setDeleteError(""); setRemove(true); }} title="Delete customer" aria-label="Delete customer" className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"><Trash2 size={17} /></button></div></div>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <section className="rounded-xl border border-slate-200/80 bg-white"><h2 className="border-b border-slate-100 px-6 py-4 text-sm font-semibold">The essentials</h2><div className="grid gap-x-8 gap-y-6 p-6 sm:grid-cols-2">{[
          { label: "Email address", icon: Mail, value: customer.email, href: customer.email ? `mailto:${customer.email}` : undefined },
          { label: "Phone number", icon: Phone, value: customer.phone, href: customer.phone ? `tel:${customer.phone}` : undefined },
          { label: "Company", icon: Building2, value: customer.company },
          { label: "Added to directory", icon: CalendarDays, value: date(customer.created_at) },
        ].map(({ label, icon: Icon, value, href }) => <div key={label} className="flex min-w-0 items-start gap-3"><Icon size={16} className="mt-0.5 shrink-0 text-slate-400" strokeWidth={1.7} /><div className="min-w-0"><p className="text-[11px] text-slate-400">{label}</p><p className="mt-1.5 break-words text-[13px] text-slate-600">{href ? <a href={href} className="hover:text-brand-700 hover:underline">{value}</a> : value || <span className="text-slate-300">Not added</span>}</p></div></div>)}</div><div className="mx-6 border-t border-slate-100 py-5"><h3 className="flex items-center gap-2 text-xs font-medium text-slate-500"><FileText size={14} className="text-slate-400" />Notes</h3><p className={`mt-2.5 whitespace-pre-wrap break-words text-xs leading-6 ${customer.notes ? "text-slate-500" : "text-slate-400"}`}>{customer.notes || "No notes yet. Add a helpful detail when you edit this customer."}</p></div></section>
        <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-6 py-4"><h2 className="flex items-center gap-2.5 text-sm font-semibold">Interaction history<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-normal text-slate-500">{customer.interaction_count}</span></h2><span className="text-[10px] text-slate-400">Newest first</span></div>
          {interactions.length ? <ol className="divide-y divide-slate-100">{interactions.map((interaction) => {
            const { label, icon: Icon, color } = kinds[interaction.kind];
            return <li key={interaction.id} className="flex gap-3.5 px-6 py-5"><span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${color}`}><Icon size={16} strokeWidth={1.7} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-semibold text-slate-700">{label}</h3><time dateTime={interaction.occurred_at} className="text-[10px] text-slate-400">{date(interaction.occurred_at, true)}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-slate-500">{interaction.summary}</p><p className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400"><span className="flex size-4 items-center justify-center rounded-full bg-slate-100 text-[7px] font-medium text-slate-500">{initials(interaction.logged_by)}</span>Logged by <span className="font-medium text-slate-500">{interaction.logged_by}</span></p></div></li>;
          })}</ol> : <div className="flex flex-col items-center px-6 py-14 text-center"><span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-500"><MessageSquare size={23} strokeWidth={1.5} /></span><h3 className="text-sm font-semibold">The conversation starts here</h3><p className="mt-2 max-w-xs text-xs leading-6 text-slate-400">Log your first call, email, or meeting to keep everyone in the loop.</p></div>}
        </section>
      </div>
      <div className="space-y-5"><section className="rounded-xl border border-brand-100/75 bg-[#f1f7f2] p-5"><p className="flex items-center gap-2 text-[11px] font-medium text-brand-700"><Clock3 size={14} />Last contacted</p><p className="mt-3 text-lg font-semibold tracking-tight text-brand-900">{date(customer.last_contacted_at)}</p><p className="mt-2 text-[11px] text-brand-600/70">{customer.interaction_count} {customer.interaction_count === 1 ? "conversation" : "conversations"} remembered</p></section><InteractionForm key={customer.id} customerId={customer.id} onSaved={() => { setRevision(revision + 1); notify("Interaction logged. Your team is in the loop."); }} /><p className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400"><Users size={12} />A shared history for stronger relationships.</p></div>
    </div>
    {edit && <CustomerForm customer={customer} onClose={() => setEdit(false)} onSaved={(saved) => { setCustomer(saved); setEdit(false); notify("Customer details updated."); }} />}
    {remove && <Modal title="Delete this customer?" description="This action can’t be undone." onClose={() => { if (!deleting) setRemove(false); }}><div className="space-y-4 p-6"><div className="flex gap-3 rounded-lg bg-red-50 p-4"><Trash2 size={20} className="mt-0.5 shrink-0 text-red-500" /><p className="text-sm leading-6 text-slate-600"><strong className="font-semibold text-slate-800">{customer.name}</strong> and all {customer.interaction_count} of their interactions will be permanently removed for your entire team.</p></div>{deleteError && <Alert>{deleteError}</Alert>}</div><div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4"><button disabled={deleting} onClick={() => setRemove(false)} className={secondaryButton}>Keep customer</button><button disabled={deleting} onClick={deleteCustomer} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">{deleting ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}{deleting ? "Deleting…" : "Delete customer"}</button></div></Modal>}
  </>;
}
