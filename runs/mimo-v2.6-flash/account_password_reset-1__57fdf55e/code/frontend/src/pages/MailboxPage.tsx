import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, apiError, type Account, type OutboxMessage } from "../api";
import {
  ErrorNotice,
  Field,
  PageTitle,
  buttonClass,
  cardClass,
} from "../ui";

function formatSentAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function BodyWithLinks({ body }: { body: string }) {
  const parts = body.split(
    /(https?:\/\/[^\s]+|\/reset\?token=[A-Za-z0-9_-]+)/g,
  );
  const rendered: ReactNode[] = parts.map((part, index) => {
    if (/^(https?:\/\/|\/reset\?token=)/.test(part)) {
      return (
        <a
          key={index}
          href={part}
          className="break-all font-medium text-sky-700 underline hover:text-sky-900"
        >
          {part}
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
  return <span className="whitespace-pre-wrap">{rendered}</span>;
}

function MessageCard({ message }: { message: OutboxMessage }) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">
          {message.subject}
        </span>
        <span className="text-xs text-slate-500">
          {formatSentAt(message.sent_at)}
        </span>
      </div>
      <div className="mb-2 text-xs text-slate-500">To: {message.to}</div>
      <div className="text-sm text-slate-700">
        <BodyWithLinks body={message.body} />
      </div>
    </li>
  );
}

export default function MailboxPage({ account }: { account: Account | null }) {
  const [address, setAddress] = useState(account?.email ?? "");
  const [messages, setMessages] = useState<OutboxMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!address && account?.email) {
      setAddress(account.email);
    }
  }, [account, address]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!address.trim()) {
      setError("Enter an address to read.");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ items: OutboxMessage[] }>(
        `/api/outbox?to=${encodeURIComponent(address.trim())}`,
      );
      if (result.status === 200 && result.data) {
        setMessages(result.data.items ?? []);
        setLoaded(true);
        if ((result.data.items ?? []).length === 0) {
          setNotice("No messages for this address.");
        }
      } else {
        setError(apiError(result, "Could not load the mailbox."));
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle>Mailbox</PageTitle>
      <div className={`${cardClass} mb-6`}>
        <p className="mb-4 text-sm text-slate-600">
          Outgoing messages stand in for delivered email. Request a password
          reset, then read the message here.
        </p>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Field
              label="Read messages for"
              type="email"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <button
            type="submit"
            className={`${buttonClass} mb-4`}
            disabled={busy}
          >
            {busy ? "Loading…" : "Load messages"}
          </button>
        </form>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        {notice && (
          <p className="text-sm text-slate-500">{notice}</p>
        )}
      </div>
      {loaded && messages.length > 0 && (
        <ul className="flex flex-col gap-4">
          {messages.map((message) => (
            <MessageCard key={message.id} message={message} />
          ))}
        </ul>
      )}
    </div>
  );
}
