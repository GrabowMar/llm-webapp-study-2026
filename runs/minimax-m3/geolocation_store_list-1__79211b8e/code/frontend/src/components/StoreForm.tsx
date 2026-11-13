import { useState, type FormEvent } from "react";
import { ApiError } from "../api";
import type { Store, StoreInput } from "../types";

type StoreFormProps = {
  title: string;
  submitLabel: string;
  initial?: Store | null;
  onSubmit: (values: StoreInput) => Promise<void>;
  onCancel?: () => void;
};

type FormState = {
  name: string;
  address: string;
  phone: string;
  latitude: string;
  longitude: string;
};

const emptyState: FormState = {
  name: "",
  address: "",
  phone: "",
  latitude: "",
  longitude: "",
};

function toFormState(store?: Store | null): FormState {
  if (!store) return emptyState;
  return {
    name: store.name,
    address: store.address,
    phone: store.phone ?? "",
    latitude: String(store.latitude),
    longitude: String(store.longitude),
  };
}

export default function StoreForm({
  title,
  submitLabel,
  initial,
  onSubmit,
  onCancel,
}: StoreFormProps) {
  const [values, setValues] = useState<FormState>(() => toFormState(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update(field: keyof FormState, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      await onSubmit({
        name: values.name.trim(),
        address: values.address.trim(),
        phone: values.phone.trim(),
        latitude: values.latitude.trim(),
        longitude: values.longitude.trim(),
      });
    } catch (cause) {
      if (cause instanceof ApiError) {
        setErrors(cause.errors);
        setMessage(
          Object.keys(cause.errors).length > 0
            ? "Please correct the highlighted fields."
            : cause.message,
        );
      } else {
        setMessage(cause instanceof Error ? cause.message : "Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  }

  const fields: {
    name: keyof FormState;
    label: string;
    type?: string;
    placeholder?: string;
    step?: string;
  }[] = [
    { name: "name", label: "Name", placeholder: "Alte Post Markt" },
    { name: "address", label: "Address", placeholder: "Hauptstrasse 12, 10115 Berlin" },
    { name: "phone", label: "Phone", placeholder: "+49 30 5550101" },
    { name: "latitude", label: "Latitude", type: "number", placeholder: "52.5200", step: "any" },
    { name: "longitude", label: "Longitude", type: "number", placeholder: "13.4050", step: "any" },
  ];

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <label key={field.name} className="block text-sm">
            <span className="font-medium text-slate-700">{field.label}</span>
            <input
              name={field.name}
              type={field.type ?? "text"}
              step={field.step}
              value={values[field.name]}
              placeholder={field.placeholder}
              onChange={(event) => update(field.name, event.target.value)}
              aria-invalid={Boolean(errors[field.name])}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-slate-900/10 ${
                errors[field.name]
                  ? "border-rose-400 focus:border-rose-500"
                  : "border-slate-300 focus:border-slate-900"
              }`}
            />
            {errors[field.name] && (
              <span className="mt-1 block text-xs font-medium text-rose-600">
                {errors[field.name]}
              </span>
            )}
          </label>
        ))}
      </div>
      {message && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {message}
        </p>
      )}
      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
