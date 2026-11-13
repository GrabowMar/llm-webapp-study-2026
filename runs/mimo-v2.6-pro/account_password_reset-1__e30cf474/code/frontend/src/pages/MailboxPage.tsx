import { useState } from "react";
import type { FormEvent } from "react";
import type { Account, Message } from "../api";
import { api } from "../api";
import {
  Card,
  Field,
  Notice,
  buttonClass,
  inputClass,
  secondaryButtonClass,
} from "../components/ui";

export default function MailboxPage({ user }: { user: Account | null }) {
  const [to, setTo] = useState(user?.email ?? "");
  const [items, setItems] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ items: Message[] }>(
        `/api/outbox?to=${encodeURIComponent(to.trim())}`,
      );
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load mailbox");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Card title="Mailbox">
        <p className="mb-4 text-sm text-slate-600">
          Messages the service has sent, as they would appear in an email
          client. Newest first.
        </p>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <form onSubmit={load} className="flex items-end gap-3">
          <div className="flex-1">
            <Field label="Address">
              <input
                className={inputClass}
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </Field>
          </div>
          <button className={buttonClass} disabled={busy}>
            {busy ? "Loading…" : "Open mailbox"}
          </button>
        </form>

        {items !== null ? (
          items.length === 0 ? (
            <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              No messages for {to}.
            </p>
          ) : (
            <ul className="space-y-4">
              {items.map((message) => (
                <li
                  key={message.id}
                  className="rounded border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-semibold text-slate-900">
                      {message.subject}
                    </h3>
                    <span className="text-xs text-slate-500">
                      {new Date(message.sent_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">to {message.to}</p>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-slate-700">
                    {message.body}
                  </pre>
                  <button
                    type="button"
                    className={`${secondaryButtonClass} mt-3 text-indigo-600`}
                    onClick={() =>
                      navigator.clipboard
                        ?.writeText(message.body)
                        .catch(() => undefined)
                    }
                  >
                    Copy body
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </Card>
    </div>
  );
}
