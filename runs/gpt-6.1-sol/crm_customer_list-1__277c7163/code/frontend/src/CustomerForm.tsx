import { useState, type FormEvent } from "react";
import { LoaderCircle, Plus, Save } from "lucide-react";
import { api, ApiError, message, type Customer } from "./api";
import { Alert, Field, inputClass, Modal, primaryButton, secondaryButton } from "./ui";

export function CustomerForm({ customer, onClose, onSaved }: { customer?: Customer; onClose: () => void; onSaved: (customer: Customer) => void }) {
  const [values, setValues] = useState({ name: customer?.name || "", email: customer?.email || "", phone: customer?.phone || "", company: customer?.company || "", notes: customer?.notes || "" });
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setErrors({});
    try {
      const saved = await api<Customer>(customer ? `/customers/${customer.id}` : "/customers", { method: customer ? "PUT" : "POST", body: JSON.stringify(values) });
      onSaved(saved);
    } catch (err) { setError(message(err)); if (err instanceof ApiError) setErrors(err.errors); }
    finally { setBusy(false); }
  }
  function field(key: keyof typeof values, label: string, placeholder: string, type = "text") {
    return <Field label={label} id={`customer-${key}`} error={errors[key]} required={key === "name"}>
      <input id={`customer-${key}`} type={type} autoFocus={key === "name"} value={values[key]} placeholder={placeholder} onChange={(event) => setValues({ ...values, [key]: event.target.value })} disabled={busy} className={`${inputClass} ${errors[key] ? "border-red-300" : ""}`} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `customer-${key}-error` : undefined} />
    </Field>;
  }
  return <Modal title={customer ? "Edit customer" : "Add a customer"} description={customer ? "Keep their details up to date for your whole team." : "A new connection starts with the essentials."} onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={submit} noValidate><div className="space-y-5 p-6">
      {error && <Alert>{error}</Alert>}
      {field("name", "Full name", "e.g. Alex Morgan")}
      <div className="grid gap-5 sm:grid-cols-2">{field("email", "Email address", "alex@company.com", "email")}{field("phone", "Phone number", "+1 (555) 000-0000", "tel")}</div>
      {field("company", "Company", "Where they work")}
      <Field label="Notes" id="customer-notes" error={errors.notes} hint="A little context for your teammates."><textarea id="customer-notes" rows={3} value={values.notes} onChange={(event) => setValues({ ...values, notes: event.target.value })} disabled={busy} placeholder="What would be helpful to remember?" className={`${inputClass} resize-y`} aria-invalid={!!errors.notes} aria-describedby={errors.notes ? "customer-notes-error" : undefined} /></Field>
      <p className="text-xs text-slate-400"><span className="text-brand-600">*</span> Required field. All other details are optional.</p>
    </div><div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/50 px-6 py-4"><button type="button" disabled={busy} onClick={onClose} className={secondaryButton}>Cancel</button><button disabled={busy} className={primaryButton}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : customer ? <Save size={16} /> : <Plus size={16} />}{busy ? "Saving…" : customer ? "Save changes" : "Add customer"}</button></div></form>
  </Modal>;
}
