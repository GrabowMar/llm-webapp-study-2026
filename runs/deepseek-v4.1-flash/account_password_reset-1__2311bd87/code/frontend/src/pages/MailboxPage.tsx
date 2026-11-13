import { useEffect, useState, type FormEvent } from "react";
import { api, getToken, type OutboxMessage } from "../api";
import { Alert, Button, Card, Field } from "../components";
import { useAuth } from "../context";
import { useApiMessage } from "../messages";

export default function MailboxPage() {
  const { account } = useAuth();
  const messageFor = useApiMessage();
  const [address, setAddress] = useState(account?.email ?? "");
  const [messages, setMessages] = useState<OutboxMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    if (account?.email) setAddress(account.email);
  }, [account?.email]);

  async function load(target: string) {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ items: OutboxMessage[] }>(
        `/api/outbox?to=${encodeURIComponent(target)}`,
      );
      setMessages(data.items);
      setOpenId(data.items[0]?.id ?? null);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await load(address.trim());
  }

  useEffect(() => {
    if (account?.email && messages === null) void load(account.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.email]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mailbox</h1>
        <p className="mt-1 text-sm text-slate-500">
          A stand-in for an email client. Messages are stored in the app's
          outbox.
        </p>
      </div>

      <Card
        title="Read messages"
        description="Enter the address that received the messages."
      >
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <Field
              label="Email address"
              name="to"
              type="email"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Loading…" : "Check mailbox"}
          </Button>
        </form>
      </Card>

      {error && <Alert kind="error">{error}</Alert>}

      {messages !== null && (
        <Card
          title={messages.length === 0 ? "No messages" : `${messages.length} message${messages.length === 1 ? "" : "s"}`}
          description={
            messages.length === 0
              ? "No mail has been sent to this address yet."
              : "Newest messages are listed first."
          }
        >
          {messages.length > 0 && (
            <ul className="divide-y divide-slate-200">
              {messages.map((message) => (
                <li key={message.id} className="py-3">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenId(openId === message.id ? null : message.id)
                    }
                    className="flex w-full items-start justify-between gap-4 text-left"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {message.subject}
                      </p>
                      <p className="text-xs text-slate-500">
                        To {message.to}
                      </p>
                    </div>
                    <span className="whitespace-nowrap text-xs text-slate-400">
                      {new Date(message.sent_at).toLocaleString()}
                    </span>
                  </button>
                  {openId === message.id && (
                    <div className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-4 font-mono text-xs text-slate-700">
                      {message.body.split(/(https?:\/\/\S+)/g).map((part, i) =>
                        /^https?:\/\//.test(part) ? (
                          <a
                            key={i}
                            href={part}
                            className="font-sans font-medium text-indigo-600 underline"
                          >
                            {part}
                          </a>
                        ) : (
                          <span key={i}>{part}</span>
                        ),
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {!getToken() && (
        <p className="text-xs text-slate-400">
          Tip: you can open the mailbox without signing in. Reset links appear
          here.
        </p>
      )}
    </div>
  );
}
