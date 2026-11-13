import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api";
import { useAuth } from "../auth";
import type { OutboxMessage } from "../types";
import { Alert, Button, Field, TextInput } from "../components";

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function ResetLink({ body }: { body: string }) {
  const match = body.match(/https?:\/\/[^\s]+\/reset\?token=[^\s]+/);
  if (!match) return null;
  const url = new URL(match[0]);
  const target = `${url.pathname}${url.search}`;
  return (
    <Link
      to={target}
      className="inline-flex rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
    >
      Open reset link
    </Link>
  );
}

export default function MailboxPage() {
  const { account } = useAuth();
  const [address, setAddress] = useState(account?.email ?? "");
  const [queried, setQueried] = useState("");
  const [items, setItems] = useState<OutboxMessage[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(to: string) {
    if (!to.trim()) {
      setItems([]);
      setQueried("");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.outbox(to.trim());
      setItems(result.items);
      setQueried(to.trim());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const saved = sessionStorage.getItem("mailbox_address");
    const initial = saved ?? account?.email ?? "";
    if (initial) {
      setAddress(initial);
      void load(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.email]);

  function submit(event: FormEvent) {
    event.preventDefault();
    sessionStorage.setItem("mailbox_address", address);
    void load(address);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Mailbox
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          The outbox stands in for a mail server. Enter an address to see the
          messages sent to it, newest first.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <Field label="Email address">
            <TextInput
              type="email"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="jane@example.com"
              required
            />
          </Field>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Loading…" : "Read mailbox"}
        </Button>
      </form>

      {error && <Alert tone="error">{error}</Alert>}

      {queried && (
        <p className="text-sm text-slate-500">
          {items.length === 0
            ? `No messages for ${queried}.`
            : `${items.length} message${items.length === 1 ? "" : "s"} for ${queried}.`}
        </p>
      )}

      <div className="space-y-4">
        {items.map((message) => (
          <article
            key={message.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {message.subject}
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  To: {message.to} · {formatDate(message.sent_at)}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                #{message.id}
              </span>
            </div>
            <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-sans text-sm text-slate-700">
              {message.body}
            </pre>
            <div className="mt-3">
              <ResetLink body={message.body} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
