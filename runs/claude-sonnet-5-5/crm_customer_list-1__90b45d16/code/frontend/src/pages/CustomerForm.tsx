import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, createCustomer, getCustomer, updateCustomer } from "../api";
import { ErrorBanner, Field, inputClass, primaryButton, secondaryButton } from "../ui";

const empty = { name: "", email: "", phone: "", company: "", notes: "" };

export default function CustomerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(id !== undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (id === undefined) return;
    getCustomer(id)
      .then((c) =>
        setForm({
          name: c.name,
          email: c.email,
          phone: c.phone ?? "",
          company: c.company ?? "",
          notes: c.notes ?? "",
        }),
      )
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const set = (key: keyof typeof empty) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFieldErrors({});
    try {
      const saved = id !== undefined ? await updateCustomer(id, form) : await createCustomer(form);
      navigate(`/customers/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
        if (Object.keys(err.fieldErrors).length === 0) setError(err.message);
      } else {
        setError("Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-slate-500">Loading...</p>;

  const editing = id !== undefined;
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">
        {editing ? "Edit customer" : "Add customer"}
      </h1>
      <form onSubmit={submit} className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm" noValidate>
        {error && <ErrorBanner message={error} />}
        <Field label="Name" htmlFor="name" error={fieldErrors.name}>
          <input id="name" className={inputClass} value={form.name} onChange={set("name")} />
        </Field>
        <Field label="Email" htmlFor="email" error={fieldErrors.email}>
          <input id="email" type="email" className={inputClass} value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Phone" htmlFor="phone" error={fieldErrors.phone}>
          <input id="phone" className={inputClass} value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Company" htmlFor="company" error={fieldErrors.company}>
          <input id="company" className={inputClass} value={form.company} onChange={set("company")} />
        </Field>
        <Field label="Notes" htmlFor="notes" error={fieldErrors.notes}>
          <textarea id="notes" rows={4} className={inputClass} value={form.notes} onChange={set("notes")} />
        </Field>
        <div className="flex gap-3">
          <button type="submit" className={primaryButton} disabled={busy}>
            {editing ? "Save changes" : "Add customer"}
          </button>
          <Link to={editing ? `/customers/${id}` : "/"} className={secondaryButton}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
