import type { FormEvent } from "react";
import { Reservation } from "../api";

export type FormData = {
  name: string;
  email: string;
  date: string;
  time: string;
  party_size: string;
  notes: string;
};

export default function ReservationForm({
  form,
  setForm,
  error,
  success,
  submitLabel,
  onSubmit,
  onCancelEdit,
  busy,
}: {
  form: FormData;
  setForm: (f: FormData) => void;
  error: string | null;
  success: string | null;
  submitLabel: string;
  onSubmit: () => void;
  onCancelEdit?: () => void;
  busy: boolean;
}) {
  const set = (patch: Partial<FormData>) => setForm({ ...form, ...patch });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  const input =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";
  const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-slate-800">{submitLabel}</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Name</label>
          <input
            className={input}
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className={label}>Email</label>
          <input
            type="email"
            className={input}
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
            required
          />
        </div>
        <div>
          <label className={label}>Date</label>
          <input
            type="date"
            className={input}
            value={form.date}
            onChange={(e) => set({ date: e.target.value })}
            required
          />
        </div>
        <div>
          <label className={label}>Time</label>
          <input
            type="time"
            className={input}
            value={form.time}
            onChange={(e) => set({ time: e.target.value })}
            required
          />
        </div>
        <div>
          <label className={label}>Party size</label>
          <input
            type="number"
            min={1}
            max={20}
            className={input}
            value={form.party_size}
            onChange={(e) => set({ party_size: e.target.value })}
            required
          />
        </div>
        <div>
          <label className={label}>Notes (optional)</label>
          <input
            className={input}
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Window table, allergy…"
          />
        </div>
      </div>
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {success && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </p>
      )}
      <div className="mt-4 flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancelEdit && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel edit
          </button>
        )}
      </div>
    </form>
  );
}

export function reservationToForm(r: Reservation): FormData {
  return {
    name: r.name,
    email: r.email,
    date: r.date,
    time: r.time,
    party_size: String(r.party_size),
    notes: r.notes ?? "",
  };
}

export function formToPayload(f: FormData): Partial<Reservation> {
  return {
    name: f.name.trim(),
    email: f.email.trim(),
    date: f.date,
    time: f.time,
    party_size: parseInt(f.party_size || "0", 10),
    notes: f.notes,
  };
}
