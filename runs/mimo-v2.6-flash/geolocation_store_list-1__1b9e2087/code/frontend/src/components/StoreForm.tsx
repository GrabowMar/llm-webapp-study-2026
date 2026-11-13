import { useState, type ChangeEvent, type FormEvent } from "react";
import { api, ApiError, type Store } from "../api";

interface StoreFormProps {
  token: string;
  initial: Store | null;
  onSaved: () => void;
  onCancel: () => void;
}

interface FormState {
  name: string;
  address: string;
  phone: string;
  latitude: string;
  longitude: string;
}

const EMPTY: FormState = { name: "", address: "", phone: "", latitude: "", longitude: "" };

function toNumber(value: string): number | string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : trimmed;
}

function fieldError(fields: Record<string, string>, key: string): string | undefined {
  return fields[key];
}

export default function StoreForm({ token, initial, onSaved, onCancel }: StoreFormProps) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          name: initial.name,
          address: initial.address,
          phone: initial.phone ?? "",
          latitude: String(initial.latitude),
          longitude: String(initial.longitude),
        }
      : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (key: keyof FormState) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    const body = {
      name: form.name,
      address: form.address,
      phone: form.phone.trim() || null,
      latitude: toNumber(form.latitude),
      longitude: toNumber(form.longitude),
    };
    try {
      if (initial) {
        await api.put(`/api/admin/stores/${initial.id}`, body, token);
      } else {
        await api.post("/api/admin/stores", body, token);
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

  const renderField = (key: keyof FormState, label: string, props: Record<string, unknown> = {}) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        className={inputClass}
        value={form[key]}
        onChange={set(key)}
        aria-invalid={fieldError(fields, key) ? true : undefined}
        {...props}
      />
      {fieldError(fields, key) && (
        <span className="mt-1 block text-xs text-red-600">{fields[key]}</span>
      )}
    </label>
  );

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h3 className="mb-3 text-sm font-semibold text-slate-900">
        {initial ? `Edit ${initial.name}` : "Add store"}
      </h3>

      {error && (
        <div
          role="alert"
          className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">{renderField("name", "Name")}</div>
        <div className="sm:col-span-2">{renderField("address", "Address")}</div>
        {renderField("phone", "Phone (optional)", { placeholder: "Omitted phone is cleared" })}
        <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-2">
          {renderField("latitude", "Latitude", { inputMode: "decimal", placeholder: "51.5" })}
          {renderField("longitude", "Longitude", { inputMode: "decimal", placeholder: "-0.12" })}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : initial ? "Save changes" : "Add store"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
