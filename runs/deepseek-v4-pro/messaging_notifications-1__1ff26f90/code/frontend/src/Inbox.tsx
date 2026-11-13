import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  broadcast,
  createNotification,
  deleteNotification,
  listNotifications,
  readAll,
  updateNotification,
} from "./api";
import TypeBadge from "./TypeBadge";
import type { ListResponse, Notification } from "./types";

type Props = {
  isAdmin: boolean;
  username: string;
  onSignOut: () => void;
  onUnread: (n: number) => void;
};

const PAGE_SIZE = 10;

const READ_OPTIONS = [
  { value: "", label: "All" },
  { value: "false", label: "Unread" },
  { value: "true", label: "Read" },
];

export default function Inbox({ isAdmin, username, onSignOut, onUnread }: Props) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [readFilter, setReadFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastType, setBroadcastType] = useState("info");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await listNotifications({
        read: readFilter || undefined,
        type: typeFilter || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      setData(res);
      onUnread(res.unread_count);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [readFilter, typeFilter, page, onUnread]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await createNotification(message, type);
      setMessage("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleReadAll() {
    setError("");
    try {
      const res = await readAll();
      setNotice(`Marked ${res.updated} as read`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleToggle(n: Notification) {
    setError("");
    try {
      await updateNotification(n.id, !n.read);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDelete(n: Notification) {
    setError("");
    try {
      await deleteNotification(n.id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleBroadcast(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await broadcast(broadcastMessage, broadcastType);
      setNotice(`Broadcast delivered to ${res.delivered} inboxes`);
      setBroadcastMessage("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-3xl p-4">
      <header className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Inbox</h1>
          <p className="text-sm text-gray-500">
            Signed in as <span className="font-medium">{username}</span>
            {isAdmin && <span className="ml-1 text-purple-600">(admin)</span>}
          </p>
        </div>
        <button
          onClick={onSignOut}
          className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Sign out
        </button>
      </header>

      {(error || notice) && (
        <div
          className={`mt-4 rounded-md px-3 py-2 text-sm ${
            error
              ? "bg-red-50 text-red-700"
              : "bg-green-50 text-green-700"
          }`}
        >
          {error || notice}
        </div>
      )}

      <section className="mt-4 rounded-lg border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-700">Add a notification</h2>
        <form onSubmit={handleAdd} className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Message"
            className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="info">info</option>
            <option value="success">success</option>
            <option value="warning">warning</option>
            <option value="error">error</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add
          </button>
        </form>
      </section>

      {isAdmin && (
        <section className="mt-4 rounded-lg border border-purple-200 bg-purple-50 p-4">
          <h2 className="text-sm font-semibold text-purple-800">
            Broadcast announcement
          </h2>
          <form
            onSubmit={handleBroadcast}
            className="mt-2 flex flex-col gap-2 sm:flex-row"
          >
            <input
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              placeholder="Announcement to every user"
              className="flex-1 rounded-md border border-purple-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              required
            />
            <select
              value={broadcastType}
              onChange={(e) => setBroadcastType(e.target.value)}
              className="rounded-md border border-purple-300 px-3 py-1.5 text-sm"
            >
              <option value="info">info</option>
              <option value="success">success</option>
              <option value="warning">warning</option>
              <option value="error">error</option>
            </select>
            <button
              type="submit"
              className="rounded-md bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-700"
            >
              Broadcast
            </button>
          </form>
        </section>
      )}

      <section className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-md border border-gray-300 p-1">
            {READ_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => {
                  setReadFilter(o.value);
                  setPage(1);
                }}
                className={`rounded px-2 py-1 text-sm ${
                  readFilter === o.value
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">All types</option>
            <option value="info">info</option>
            <option value="success">success</option>
            <option value="warning">warning</option>
            <option value="error">error</option>
          </select>

          <button
            onClick={handleReadAll}
            className="ml-auto rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Mark all as read
          </button>
        </div>

        {data && (
          <p className="mt-2 text-xs text-gray-500">
            {data.total} notification{data.total === 1 ? "" : "s"}
          </p>
        )}

        <ul className="mt-2 divide-y divide-gray-200">
          {data?.items.map((n) => (
            <li
              key={n.id}
              className={`flex items-start gap-3 py-3 ${
                n.read ? "" : "bg-blue-50/40"
              }`}
            >
              <button
                onClick={() => handleToggle(n)}
                title={n.read ? "Mark unread" : "Mark read"}
                className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 text-xs text-white"
                style={n.read ? { backgroundColor: "#2563eb" } : undefined}
              >
                {n.read ? "✓" : ""}
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <TypeBadge type={n.type} />
                  <span className="text-xs text-gray-400">
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </div>
                <p
                  className={`mt-1 whitespace-pre-wrap text-sm text-gray-800 ${
                    n.read ? "" : "font-bold"
                  }`}
                >
                  {n.message}
                </p>
              </div>
              <button
                onClick={() => handleDelete(n)}
                className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>

        {data && data.items.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-400">
            No notifications.
          </p>
        )}

        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-md border border-gray-300 px-3 py-1 text-sm disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-md border border-gray-300 px-3 py-1 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
