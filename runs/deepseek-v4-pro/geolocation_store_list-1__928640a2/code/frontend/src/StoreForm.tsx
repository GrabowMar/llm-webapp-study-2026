import { useState } from "react";
import type { Store, StoreInput } from "../types";

interface StoreFormProps {
  initial?: Store;
  error?: string;
  fieldErrors?: Record<string, string>;
  submitting: boolean;
  onSubmit: (input: StoreInput) => void;
  onCancel: () => void;
}

export default function StoreForm({
  initial,
  error,
  fieldErrors = {},
  submitting,
  onSubmit,
  onCancel,
}: StoreFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [latitude, setLatitude] = useState(initial ? String(initial.latitude) : "");
  const [longitude, setLongitude] = useState(initial ? String(initial.longitude) : "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name,
      address,
      phone,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
    });
  }

  const field = (key: string) =>
    fieldErrors[key] ? (
      <p className="mt-1 text-sm text-red-600">{fieldErrors[key]}</p>
    ) : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="text-lg font-semibold text-slate-800">
        {initial ? "Edit store" : "Add store"}
      </h3>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        <label className="block text-sm font-medium text-slate-700">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        {field("name")}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Address</label>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        {field("address")}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Phone</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        {field("phone")}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Latitude</label>
          <input
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          {field("latitude")}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Longitude</label>
          <input
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          {field("longitude")}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
