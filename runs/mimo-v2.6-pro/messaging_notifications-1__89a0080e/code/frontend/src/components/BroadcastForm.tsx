import { useState } from "react";
import type { FormEvent } from "react";

type Props = {
  onBroadcast: (message: string, type: string) => Promise<number | null>;
};

export default function BroadcastForm({ onBroadcast }: Props) {
  const [message, setMessage] = useState("");
  const [type, setType] = useState("announcement");
  const [busy, setBusy] = useState(false);
  const [delivered, setDelivered] = useState<number | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setDelivered(null);
    const result = await onBroadcast(message.trim(), type.trim());
    setBusy(false);
    if (result !== null) {
      setDelivered(result);
      setMessage("");
      setType("announcement");
    }
  };

  return (
    <section className="rounded-2xl border border-purple-200 bg-purple-50 p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-semibold text-slate-900">Broadcast announcement</h2>
      <p className="mt-1 text-sm text-slate-500">
        Sends the same notification to every user&apos;s inbox.
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1">
          <span className="mb-1 block text-xs font-medium text-slate-500">Message</span>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Announcement for everyone"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
            required
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-500">Type</span>
          <input
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Broadcast"}
        </button>
      </form>
      {delivered !== null && (
        <p className="mt-3 text-sm font-medium text-purple-800">
          Delivered to {delivered} inbox{delivered === 1 ? "" : "es"}.
        </p>
      )}
    </section>
  );
}
