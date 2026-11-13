import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, extractErrors } from "../api";

interface FormState {
  name: string;
  email: string;
  phone: string;
  company: string;
  notes: string;
}

const empty: FormState = { name: "", email: "", phone: "", company: "", notes: "" };

export default function CustomerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = id != null;
  const customerId = Number(id);

  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (!isEdit) return;
    api
      .getCustomer(customerId)
      .then((c) => {
        setForm({
          name: c.name ?? "",
          email: c.email ?? "",
          phone: c.phone ?? "",
          company: c.company ?? "",
          notes: c.notes ?? "",
        });
      })
      .catch(() => setErrors({ form: "Could not load customer." }))
      .finally(() => setLoading(false));
  }, [customerId, isEdit]);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const payload = {
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      company: form.company || null,
      notes: form.notes || null,
    };
    try {
      const saved = isEdit
        ? await api.updateCustomer(customerId, payload)
        : await api.createCustomer(payload);
      navigate(`/customers/${saved.id}`);
    } catch (err) {
      setErrors(extractErrors((err as { body?: unknown }).body));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div className="max-w-lg">
      <Link to={isEdit ? `/customers/${customerId}` : "/"} className="text-sm text-indigo-600 hover:underline">
        ← Back
      </Link>
      <h2 className="mt-1 mb-6 text-2xl font-semibold text-slate-900">
        {isEdit ? "Edit customer" : "Add customer"}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {errors.form && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errors.form}</p>
        )}

        <Field label="Name" required>
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className={inputClass}
          />
          {errors.name && <ErrorText>{errors.name}</ErrorText>}
        </Field>

        <Field label="Email">
          <input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            className={inputClass}
          />
          {errors.email && <ErrorText>{errors.email}</ErrorText>}
        </Field>

        <Field label="Phone">
          <input
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Company">
          <input
            value={form.company}
            onChange={(e) => set("company", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Notes">
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={4}
            className={inputClass}
          />
        </Field>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : isEdit ? "Save changes" : "Add customer"}
          </button>
          <Link
            to={isEdit ? `/customers/${customerId}` : "/"}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-sm text-red-600">{children}</p>;
}
