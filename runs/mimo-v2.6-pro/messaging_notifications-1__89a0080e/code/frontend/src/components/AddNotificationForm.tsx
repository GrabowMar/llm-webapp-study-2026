import { useState } from "react";
import type { FormEvent } from "react";

type Props = {
  onAdd: (message: string, type: string) => Promise<boolean>;
};

export default function AddNotificationForm({ onAdd }: Props) {
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    const ok = await onAdd(message.trim(), type.trim());
    setBusy(false);
    if (ok) {
      setMessage("");
      setType("info");
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-semibold text-slate-900">Add notification</h2>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1">
          <span className="mb-1 block text-xs font-medium text-slate-500">Message</span>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="What's new?"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-500">Type</span>
          <input
            list="add-type-options"
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
        <datalist id="add-type-options">
          <option value="info" />
          <option value="success" />
          <option value="warning" />
          <option value="error" />
          <option value="announcement" />
        </datalist>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </form>
    </section>
  );
}
