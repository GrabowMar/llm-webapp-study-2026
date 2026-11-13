import { useState } from "react";

const TYPE_OPTIONS = [
  "info",
  "success",
  "warning",
  "error",
  "announcement",
  "message",
];

function ComposeForm({
  title,
  description,
  submitLabel,
  onSubmit,
}: {
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: (message: string, type: string) => Promise<string>;
}) {
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!message.trim()) {
      setError("Write a message first.");
      return;
    }
    setBusy(true);
    try {
      const note = await onSubmit(message.trim(), type);
      setMessage("");
      setSuccess(note);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">{description}</p>

      <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
          placeholder="Type your message…"
          className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />

        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Type
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal normal-case text-slate-700 focus:border-indigo-500 focus:outline-none"
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Sending…" : submitLabel}
          </button>
        </div>

        {error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
        ) : null}
        {success ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{success}</p>
        ) : null}
      </form>
    </section>
  );
}

export function AddNotificationForm({
  onSubmit,
}: {
  onSubmit: (message: string, type: string) => Promise<string>;
}) {
  return (
    <ComposeForm
      title="Add notification"
      description="Send a notification to your own inbox. It arrives unread."
      submitLabel="Add"
      onSubmit={onSubmit}
    />
  );
}

export function BroadcastForm({
  onSubmit,
}: {
  onSubmit: (message: string, type: string) => Promise<string>;
}) {
  return (
    <ComposeForm
      title="Broadcast announcement"
      description="Publish a message into every user's inbox."
      submitLabel="Broadcast"
      onSubmit={onSubmit}
    />
  );
}
