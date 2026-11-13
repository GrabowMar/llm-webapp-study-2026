import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, Me, Notification, Page, api } from "./api";

const PAGE_SIZE = 10;
const TYPES = ["info", "success", "warning", "error", "announcement"];

const badgeColors: Record<string, string> = {
  info: "bg-blue-100 text-blue-800",
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-800",
  announcement: "bg-purple-100 text-purple-800",
};

const field =
  "rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const primary =
  "rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";
const secondary =
  "rounded bg-slate-200 px-2 py-1 text-xs hover:bg-slate-300 disabled:opacity-50";

function Compose({
  title,
  submitLabel,
  path,
  defaultType,
  onSent,
  onExpired,
}: {
  title: string;
  submitLabel: string;
  path: string;
  defaultType: string;
  onSent: () => void;
  onExpired: () => void;
}) {
  const [message, setMessage] = useState("");
  const [type, setType] = useState(defaultType);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await api<{ delivered?: number }>(path, "POST", { message, type });
      setMessage("");
      setStatus({
        ok: true,
        text: res?.delivered !== undefined ? `Delivered to ${res.delivered} inboxes` : "Added",
      });
      onSent();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onExpired();
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      aria-label={title}
      className="space-y-2 rounded bg-white p-4 shadow"
    >
      <h2 className="font-semibold">{title}</h2>
      <div className="flex flex-wrap gap-2">
        <input
          className={`${field} min-w-0 flex-1`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Message"
          aria-label="Message"
          maxLength={1000}
          required
        />
        <select
          className={field}
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label="Type"
        >
          {TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button className={primary} disabled={busy || !message.trim()}>
          {submitLabel}
        </button>
      </div>
      {status && (
        <p
          role={status.ok ? "status" : "alert"}
          className={`text-sm ${status.ok ? "text-green-700" : "text-red-600"}`}
        >
          {status.text}
        </p>
      )}
    </form>
  );
}

export default function Inbox({
  me,
  onUnread,
  onExpired,
}: {
  me: Me;
  onUnread: (n: number) => void;
  onExpired: () => void;
}) {
  const [data, setData] = useState<Page | null>(null);
  const [read, setRead] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const q = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (read) q.set("read", read);
    if (type) q.set("type", type);
    try {
      const res = await api<Page>(`/notifications?${q}`);
      const last = Math.max(1, Math.ceil(res.total / res.page_size));
      onUnread(res.unread_count);
      if (res.page > last) {
        setPage(last);
        return;
      }
      setData(res);
      setError("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onExpired();
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [page, read, type, onUnread, onExpired]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onExpired();
      if (!(err instanceof ApiError && err.status === 404)) {
        setError(err instanceof Error ? err.message : "Action failed");
        return;
      }
    }
    await load();
  }

  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="space-y-4">
      <Compose
        title="Add notification"
        submitLabel="Add"
        path="/notifications"
        defaultType="info"
        onSent={load}
        onExpired={onExpired}
      />
      {me.is_admin && (
        <Compose
          title="Broadcast announcement"
          submitLabel="Broadcast"
          path="/admin/broadcast"
          defaultType="announcement"
          onSent={load}
          onExpired={onExpired}
        />
      )}

      <section className="rounded bg-white p-4 shadow">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-semibold">Inbox</h2>
          <select
            className={field}
            aria-label="Filter by read state"
            value={read}
            onChange={(e) => {
              setRead(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option value="false">Unread</option>
            <option value="true">Read</option>
          </select>
          <select
            className={field}
            aria-label="Filter by type"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <button
            className={primary}
            disabled={!data || data.unread_count === 0}
            onClick={() => act(() => api("/notifications/read-all", "POST"))}
          >
            Mark all as read
          </button>
        </div>

        {error && (
          <p role="alert" className="mb-2 text-sm text-red-600">
            {error}
          </p>
        )}

        {data && data.items.length === 0 && (
          <p className="py-6 text-center text-slate-500">No notifications.</p>
        )}

        <ul className="divide-y divide-slate-200">
          {data?.items.map((n: Notification) => (
            <li key={n.id} className="flex items-center gap-3 py-2" data-read={n.read}>
              <span
                className={`rounded px-2 py-0.5 text-xs ${
                  badgeColors[n.type] ?? "bg-slate-200 text-slate-800"
                }`}
              >
                {n.type}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`break-words ${n.read ? "font-normal" : "font-bold"}`}>
                  {n.message}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </div>
              <button
                className={secondary}
                onClick={() =>
                  act(() => api(`/notifications/${n.id}`, "PATCH", { read: !n.read }))
                }
              >
                {n.read ? "Mark unread" : "Mark read"}
              </button>
              <button
                className={`${secondary} text-red-700`}
                onClick={() => act(() => api(`/notifications/${n.id}`, "DELETE"))}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-center justify-between text-sm">
          <button
            className={secondary}
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {data?.page ?? page} of {lastPage} ({data?.total ?? 0} total)
          </span>
          <button
            className={secondary}
            disabled={page >= lastPage}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
