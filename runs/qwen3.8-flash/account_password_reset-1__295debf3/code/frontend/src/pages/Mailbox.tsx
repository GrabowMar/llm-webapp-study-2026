import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, fetchOutbox } from "../api";
import type { OutboxMessage } from "../api";
import { useAuth } from "../auth";
import { Alert, Button, Field } from "../ui";

export default function Mailbox() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [address, setAddress] = useState(params.get("address") ?? user?.email ?? "");
  const [messages, setMessages] = useState<OutboxMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(to: string) {
    setBusy(true);
    setError(null);
    try {
      const { items } = await fetchOutbox(to);
      setMessages(items);
      setParams({ address: to }, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setMessages(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const initial = params.get("address") ?? user?.email;
    if (initial) void load(initial);
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (address.trim()) void load(address.trim());
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div>
        <h2 className="mb-3 text-xl font-semibold text-slate-900">Mailbox</h2>
        <form onSubmit={onSubmit} className="flex items-end gap-3">
          <div className="flex-1">
            <Field
              label="Address"
              type="email"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <Button type="submit" disabled={busy} className="py-2">
            {busy ? "Loading…" : "Read mail"}
          </Button>
        </form>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {messages && messages.length === 0 && (
        <p className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
          No messages for {address.trim()}.
        </p>
      )}

      <ul className="space-y-3">
        {messages?.map((m) => (
          <li key={m.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-1 flex items-baseline justify-between gap-4">
              <p className="font-medium text-slate-900">{m.subject}</p>
              <p className="shrink-0 text-xs text-slate-500">{m.sent_at}</p>
            </div>
            <p className="mb-2 text-xs text-slate-500">To: {m.to}</p>
            <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{m.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
