import { useState } from "react";
import type { FormEvent } from "react";
import type { FormError, Store, StoreInput } from "../types";

interface Props {
  initial: Store | null;
  submitLabel: string;
  error: FormError | null;
  onSubmit: (input: StoreInput) => Promise<void>;
  onCancel: () => void;
}

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none";

export default function StoreForm({ initial, submitLabel, error, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [latitude, setLatitude] = useState(String(initial?.latitude ?? ""));
  const [longitude, setLongitude] = useState(String(initial?.longitude ?? ""));
  const [busy, setBusy] = useState(false);

  function numberOrText(raw: string): number | string {
    const trimmed = raw.trim();
    const value = Number(trimmed);
    return trimmed !== "" && Number.isFinite(value) ? value : raw;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmit({
        name,
        address,
        phone: phone.trim() === "" ? null : phone,
        latitude: numberOrText(latitude),
        longitude: numberOrText(longitude),
      });
    } finally {
      setBusy(false);
    }
  }

  const fields = error?.fields ?? {};

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h3 className="text-base font-semibold text-slate-900">
        {initial ? `Edit ${initial.name}` : "Add a store"}
      </h3>

      {error !== null && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
        >
          {error.message}
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col text-xs font-medium text-slate-600">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          {fields.name && <span className="mt-1 text-xs text-red-600">{fields.name}</span>}
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-600">
          Address
          <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
          {fields.address && <span className="mt-1 text-xs text-red-600">{fields.address}</span>}
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-600">
          Phone (optional)
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          {fields.phone && <span className="mt-1 text-xs text-red-600">{fields.phone}</span>}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col text-xs font-medium text-slate-600">
            Latitude
            <input
              value={latitude}
              inputMode="decimal"
              onChange={(e) => setLatitude(e.target.value)}
              className={inputClass}
            />
            {fields.latitude && <span className="mt-1 text-xs text-red-600">{fields.latitude}</span>}
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-600">
            Longitude
            <input
              value={longitude}
              inputMode="decimal"
              onChange={(e) => setLongitude(e.target.value)}
              className={inputClass}
            />
            {fields.longitude && (
              <span className="mt-1 text-xs text-red-600">{fields.longitude}</span>
            )}
          </label>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
