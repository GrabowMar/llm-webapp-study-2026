import { useState } from "react";
import { api, draftToPayload, type ApiError, type StoreDraft } from "./api";

type Props = {
  token: string;
  initial: StoreDraft;
  storeId?: number;
  title: string;
  submitLabel: string;
  onSaved: () => void;
  onCancel: () => void;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-rose-600">{message}</p>;
}

export default function StoreForm({ token, initial, storeId, title, submitLabel, onSaved, onCancel }: Props) {
  const [draft, setDraft] = useState<StoreDraft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (key: keyof StoreDraft, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError("");
    try {
      await api(
        storeId ? `/api/admin/stores/${storeId}` : "/api/admin/stores",
        { method: storeId ? "PUT" : "POST", body: JSON.stringify(draftToPayload(draft)) },
        token,
      );
      onSaved();
    } catch (err) {
      const e = err as ApiError;
      if (e.errors) setErrors(e.errors);
      else setFormError(e.error ?? "Could not save the store. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = (field: string) =>
    `w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${errors[field] ? "border-rose-400" : "border-slate-300"}`;

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
      {formError && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="f-name">Name</label>
        <input id="f-name" className={inputClass("name")} value={draft.name} onChange={(e) => set("name", e.target.value)} />
        <FieldError message={errors.name} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="f-address">Address</label>
        <input id="f-address" className={inputClass("address")} value={draft.address} onChange={(e) => set("address", e.target.value)} />
        <FieldError message={errors.address} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="f-phone">Phone</label>
        <input id="f-phone" className={inputClass("phone")} value={draft.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Optional" />
        <FieldError message={errors.phone} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="f-lat">Latitude</label>
          <input id="f-lat" className={inputClass("latitude")} value={draft.latitude} onChange={(e) => set("latitude", e.target.value)} placeholder="e.g. 51.5074" />
          <FieldError message={errors.latitude} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="f-lng">Longitude</label>
          <input id="f-lng" className={inputClass("longitude")} value={draft.longitude} onChange={(e) => set("longitude", e.target.value)} placeholder="e.g. -0.1278" />
          <FieldError message={errors.longitude} />
        </div>
      </div>
      <FieldError message={errors.body} />
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? "Saving…" : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
      </div>
    </form>
  );
}
