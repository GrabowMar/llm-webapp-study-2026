import { useState } from "react";
import { ApiError, errorMessage } from "../api";
import type { Customer, CustomerPayload } from "../types";

type Props = {
  title: string;
  submitLabel: string;
  customer?: Customer | null;
  onSubmit: (payload: CustomerPayload) => Promise<void>;
  onCancel: () => void;
};

const FIELDS: { key: keyof CustomerPayload; label: string; required?: boolean; type?: "input" | "textarea" }[] = [
  { key: "name", label: "Name", required: true },
  { key: "email", label: "Email", required: true },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Company" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export default function CustomerForm({ title, submitLabel, customer, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<Record<string, string>>({
    name: customer?.name ?? "",
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
    company: customer?.company ?? "",
    notes: customer?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function setValue(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    const payload: CustomerPayload = {
      name: values.name,
      email: values.email,
      phone: values.phone || null,
      company: values.company || null,
      notes: values.notes || null,
    };
    try {
      await onSubmit(payload);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  const shownMessages = new Set(Object.values(fieldErrors));

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          Cancel
        </button>
      </div>

      {error && !shownMessages.has(error) && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {FIELDS.map((field) => (
        <div key={field.key}>
          <label
            htmlFor={`customer-${field.key}`}
            className="block text-sm font-medium text-slate-700"
          >
            {field.label}
            {field.required && <span className="text-red-500"> *</span>}
          </label>
          {field.type === "textarea" ? (
            <textarea
              id={`customer-${field.key}`}
              name={field.key}
              rows={3}
              value={values[field.key] ?? ""}
              onChange={(event) => setValue(field.key, event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          ) : (
            <input
              id={`customer-${field.key}`}
              name={field.key}
              type="text"
              value={values[field.key] ?? ""}
              onChange={(event) => setValue(field.key, event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          )}
          {fieldErrors[field.key] && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors[field.key]}</p>
          )}
        </div>
      ))}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
