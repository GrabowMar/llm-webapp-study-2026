import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { getOutbox } from "../api";
import type { OutboxMessage } from "../api";
import { useAuth } from "../auth";
import { Button, Card, Notice, TextField } from "../ui";

function MessageBody({ body }: { body: string }) {
  const parts = body.split(/(https?:\/\/\S+)/g);
  return (
    <p className="whitespace-pre-wrap text-sm text-slate-700">
      {parts.map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={index}
            href={part}
            className="font-medium text-indigo-600 underline underline-offset-2"
          >
            {part}
          </a>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </p>
  );
}

export default function Mailbox() {
  const { account } = useAuth();
  const [params, setParams] = useSearchParams();
  const [address, setAddress] = useState(params.get("to") ?? "");
  const [messages, setMessages] = useState<OutboxMessage[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const fromQuery = params.get("to");
    if (fromQuery) {
      setAddress(fromQuery);
    } else if (!address && account?.email) {
      setAddress(account.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, account]);

  async function load(to: string) {
    if (!to.trim()) {
      setError("Enter the address to read.");
      setMessages([]);
      setLoaded(false);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const result = await getOutbox(to);
      setMessages(result.items);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the mailbox");
      setMessages([]);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setParams(address.trim() ? { to: address.trim() } : {});
    await load(address);
  }

  return (
    <div className="space-y-6">
      <Card
        title="Mailbox"
        description="No real email is sent. This page shows the messages that were produced for an address, newest first."
      >
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onSubmit}>
          <div className="flex-1">
            <TextField
              id="mailbox-address"
              label="Address"
              type="email"
              value={address}
              onChange={setAddress}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <Button disabled={busy}>{busy ? "Loading…" : "Show messages"}</Button>
        </form>
        {error ? (
          <div className="mt-4">
            <Notice tone="error">{error}</Notice>
          </div>
        ) : null}
      </Card>

      {loaded && messages.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">
            There are no messages for this address.
          </p>
        </Card>
      ) : null}

      {messages.map((message) => (
        <Card key={message.id}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">
              {message.subject}
            </h3>
            <time
              dateTime={message.sent_at}
              className="text-xs text-slate-400"
              title={message.sent_at}
            >
              {new Date(message.sent_at).toLocaleString()}
            </time>
          </div>
          <p className="mt-1 text-xs text-slate-500">To: {message.to}</p>
          <div className="mt-3 rounded-lg bg-slate-50 p-3">
            <MessageBody body={message.body} />
          </div>
        </Card>
      ))}
    </div>
  );
}
