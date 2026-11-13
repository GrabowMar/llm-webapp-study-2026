import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "./api";
import type { Store, StoreInput } from "./api";

type Props = {
  initial?: Store;
  onSubmit: (input: StoreInput) => Promise<void>;
  onCancel: () => void;
};

const FIELDS = [
  { key: "name", label: "Name", required: true },
  { key: "address", label: "Address", required: true },
  { key: "phone", label: "Phone (optional)", required: false },
  { key: "latitude", label: "Latitude", required: true },
  { key: "longitude", label: "Longitude", required: true },
] as const;

type Key = (typeof FIELDS)[number]["key"];

function toNumber(v: string): number | string {
  const t = v.trim();
  if (t === "") return "";
  const n = Number(t);
  return Number.isFinite(n) ? n : t;
}

export default function StoreForm({ initial, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<Record<Key, string>>({
    name: initial?.name ?? "",
    address: initial?.address ?? "",
    phone: initial?.phone ?? "",
    latitude: initial ? String(initial.latitude) : "",
    longitude: initial ? String(initial.longitude) : "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    const input: StoreInput = {
      name: values.name,
      address: values.address,
      latitude: toNumber(values.latitude),
      longitude: toNumber(values.longitude),
    };
    if (values.phone.trim()) input.phone = values.phone;
    try {
      await onSubmit(input);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        setMessage(err.message);
      } else {
        setMessage("Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      aria-label={initial ? "Edit store" : "Add store"}
    >
      <h2 className="text-lg font-semibold text-slate-800">{initial ? `Edit “${initial.name}”` : "Add a store"}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label
            key={f.key}
            className={`flex flex-col gap-1 text-sm text-slate-700 ${f.key === "name" || f.key === "address" ? "sm:col-span-2" : ""}`}
          >
            {f.label}
            <input
              name={f.key}
              inputMode={f.key === "latitude" || f.key === "longitude" ? "decimal" : undefined}
              className={`rounded border px-3 py-2 focus:outline-none focus:ring-2 ${
                errors[f.key]
                  ? "border-red-400 focus:ring-red-200"
                  : "border-slate-300 focus:border-blue-500 focus:ring-blue-200"
              }`}
              value={values[f.key]}
              aria-invalid={Boolean(errors[f.key])}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
            {errors[f.key] && <span className="text-xs text-red-600">{errors[f.key]}</span>}
          </label>
        ))}
      </div>
      {message && (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : initial ? "Save changes" : "Add store"}
        </button>
        <button type="button" onClick={onCancel} className="rounded px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
      </div>
    </form>
  );
}
