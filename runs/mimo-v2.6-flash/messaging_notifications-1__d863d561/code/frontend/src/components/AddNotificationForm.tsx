import { useState, type FormEvent } from "react";
import { api } from "../api";
import type { Notification } from "../types";

type Props = {
  onAdded: () => void;
};

export default function AddNotificationForm({ onAdded }: Props) {
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api<Notification>("/api/notifications", {
        method: "POST",
        body: { message, type },
      });
      setMessage("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">Add notification</h2>
      <p className="mt-0.5 text-xs text-gray-500">Sends a notification to your own inbox.</p>
      <div className="mt-3 space-y-2">
        <input
          type="text"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Message"
          required
          aria-label="Notification message"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <input
          type="text"
          value={type}
          onChange={(event) => setType(event.target.value)}
          placeholder="Type (e.g. info)"
          aria-label="Notification type"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      {error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="mt-3 w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Add
      </button>
    </form>
  );
}
