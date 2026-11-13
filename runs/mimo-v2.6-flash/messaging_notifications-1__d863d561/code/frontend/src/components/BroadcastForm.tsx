import { useState, type FormEvent } from "react";
import { api } from "../api";

type Props = {
  onBroadcast: () => void;
};

export default function BroadcastForm({ onBroadcast }: Props) {
  const [message, setMessage] = useState("");
  const [type, setType] = useState("announcement");
  const [error, setError] = useState<string | null>(null);
  const [delivered, setDelivered] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setDelivered(null);
    try {
      const result = await api<{ delivered: number }>("/api/admin/broadcast", {
        method: "POST",
        body: { message, type },
      });
      setDelivered(result.delivered);
      setMessage("");
      onBroadcast();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-purple-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Broadcast announcement</h2>
        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
          Admin
        </span>
      </div>
      <p className="mt-0.5 text-xs text-gray-500">Adds the message to every user&apos;s inbox.</p>
      <div className="mt-3 space-y-2">
        <input
          type="text"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Message"
          required
          aria-label="Broadcast message"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
        <input
          type="text"
          value={type}
          onChange={(event) => setType(event.target.value)}
          placeholder="Type (e.g. announcement)"
          aria-label="Broadcast type"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
      </div>
      {error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
      {delivered !== null && (
        <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700" role="status">
          Delivered to {delivered} {delivered === 1 ? "inbox" : "inboxes"}.
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="mt-3 w-full rounded-md bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Broadcast
      </button>
    </form>
  );
}
