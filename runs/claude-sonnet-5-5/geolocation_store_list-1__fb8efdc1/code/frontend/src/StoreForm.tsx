import { useState } from "react";
import { ApiError, createStore, updateStore, type Store } from "./api";

interface Props {
  store: Store | null;
  onSaved: () => void;
  onCancel: () => void;
  onAuthLost: () => void;
}

const input = "mt-1 w-full rounded border border-slate-300 px-2 py-1";

export default function StoreForm({ store, onSaved, onCancel, onAuthLost }: Props) {
  const [values, setValues] = useState({
    name: store?.name ?? "",
    address: store?.address ?? "",
    phone: store?.phone ?? "",
    latitude: store ? String(store.latitude) : "",
    longitude: store ? String(store.longitude) : "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues({ ...values, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage("");
    try {
      if (store) await updateStore(store.id, values);
      else await createStore(values);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401 || err.status === 403) onAuthLost();
        setErrors(err.details);
        setMessage(err.message);
      } else {
        setMessage("Could not reach the server");
      }
    } finally {
      setBusy(false);
    }
  }

  const field = (k: keyof typeof values, label: string, type = "text") => (
    <label className="block text-sm">
      {label}
      <input
        className={input}
        type={type}
        step={type === "number" ? "any" : undefined}
        value={values[k]}
        onChange={set(k)}
        aria-invalid={errors[k] ? true : undefined}
      />
      {errors[k] && <span className="text-red-600" role="alert">{errors[k]}</span>}
    </label>
  );

  return (
    <form onSubmit={submit} className="space-y-3 rounded border border-slate-300 bg-white p-4">
      <h3 className="font-semibold">{store ? `Edit ${store.name}` : "Add a store"}</h3>
      {field("name", "Name")}
      {field("address", "Address")}
      {field("phone", "Phone")}
      <div className="grid grid-cols-2 gap-3">
        {field("latitude", "Latitude", "number")}
        {field("longitude", "Longitude", "number")}
      </div>
      {message && Object.keys(errors).length === 0 && (
        <p className="text-sm text-red-600" role="alert">{message}</p>
      )}
      <div className="flex gap-2">
        <button disabled={busy} className="rounded bg-indigo-600 px-3 py-1 text-white disabled:opacity-50">
          {store ? "Save" : "Add"}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-3 py-1">
          Cancel
        </button>
      </div>
    </form>
  );
}
