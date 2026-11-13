import { useState } from "react";
import {
  ApiError,
  createStore,
  type Store,
  type StorePayload,
  updateStore,
} from "./api";

interface Props {
  store: Store | null;
  onSaved: () => void;
  onCancel: () => void;
}

const fieldClass =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

export function StoreForm({ store, onSaved, onCancel }: Props) {
  const [name, setName] = useState(store?.name ?? "");
  const [address, setAddress] = useState(store?.address ?? "");
  const [phone, setPhone] = useState(store?.phone ?? "");
  const [latitude, setLatitude] = useState(
    store ? String(store.latitude) : "",
  );
  const [longitude, setLongitude] = useState(
    store ? String(store.longitude) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: StorePayload = {
      name,
      address,
      phone: phone.trim() ? phone.trim() : null,
      latitude: Number(latitude),
      longitude: Number(longitude),
    };
    try {
      if (store) await updateStore(store.id, payload);
      else await createStore(payload);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-sky-200 bg-white p-4 shadow"
    >
      <h3 className="text-sm font-semibold text-slate-700">
        {store ? `Edit “${store.name}”` : "Add a store"}
      </h3>
      {error && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}
      <div>
        <label className="text-xs font-medium text-slate-500">Name *</label>
        <input
          className={fieldClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500">Address *</label>
        <input
          className={fieldClass}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500">
          Phone (leave empty to clear)
        </label>
        <input
          className={fieldClass}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-500">
            Latitude * (-90…90)
          </label>
          <input
            className={fieldClass}
            type="number"
            step="any"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">
            Longitude * (-180…180)
          </label>
          <input
            className={fieldClass}
            type="number"
            step="any"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : store ? "Save changes" : "Create store"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium hover:bg-slate-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
