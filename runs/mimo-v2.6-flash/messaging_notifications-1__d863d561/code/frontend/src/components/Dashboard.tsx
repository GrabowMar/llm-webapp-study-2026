import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Notification, NotificationList, Session } from "../types";
import AddNotificationForm from "./AddNotificationForm";
import BroadcastForm from "./BroadcastForm";
import Header from "./Header";
import NotificationItem from "./NotificationItem";

type Props = {
  session: Session;
  onSignOut: () => void;
};

type ReadFilter = "all" | "unread" | "read";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export default function Dashboard({ session, onSignOut }: Props) {
  const [list, setList] = useState<NotificationList | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    if (readFilter === "read") {
      params.set("read", "true");
    } else if (readFilter === "unread") {
      params.set("read", "false");
    }
    const type = typeFilter.trim();
    if (type) {
      params.set("type", type);
    }
    try {
      const data = await api<NotificationList>(`/api/notifications?${params.toString()}`);
      if (id !== requestId.current) {
        return;
      }
      setList(data);
      setError(null);
      const pages = Math.max(1, Math.ceil(data.total / data.page_size));
      if (data.total > 0 && page > pages) {
        setPage(pages);
      } else if (data.total === 0 && page > 1) {
        setPage(1);
      }
    } catch (err) {
      if (id !== requestId.current) {
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load notifications");
    }
  }, [page, pageSize, readFilter, typeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  function refresh() {
    load();
  }

  async function markAllRead() {
    await run(() => api("/api/notifications/read-all", { method: "POST" }));
  }

  async function toggleRead(notification: Notification) {
    await run(() =>
      api(`/api/notifications/${notification.id}`, {
        method: "PATCH",
        body: { read: !notification.read },
      }),
    );
  }

  async function removeNotification(notification: Notification) {
    try {
      await api(`/api/notifications/${notification.id}`, { method: "DELETE" });
      if (list && list.items.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function addNotification() {
    if (page !== 1) {
      setPage(1);
    } else {
      await load();
    }
  }

  const total = list?.total ?? 0;
  const unreadCount = list?.unread_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="min-h-screen bg-gray-50">
      <Header username={session.username} unreadCount={unreadCount} onSignOut={onSignOut} />

      <main className="mx-auto grid max-w-5xl gap-4 px-4 py-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Inbox</h2>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {total} total
              </span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                {unreadCount} unread
              </span>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <label htmlFor="read-filter" className="sr-only">
                  Read filter
                </label>
                <select
                  id="read-filter"
                  value={readFilter}
                  onChange={(event) => {
                    setReadFilter(event.target.value as ReadFilter);
                    setPage(1);
                  }}
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="all">All</option>
                  <option value="unread">Unread</option>
                  <option value="read">Read</option>
                </select>

                <label htmlFor="type-filter" className="sr-only">
                  Type filter
                </label>
                <input
                  id="type-filter"
                  type="text"
                  value={typeFilter}
                  onChange={(event) => {
                    setTypeFilter(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Filter by type"
                  className="w-32 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />

                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={unreadCount === 0}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Mark all as read
                </button>
              </div>
            </div>

            {error && (
              <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}

            {list === null ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">Loading…</p>
            ) : list.items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">No notifications.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {list.items.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onToggle={toggleRead}
                    onDelete={removeNotification}
                  />
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
              <span className="text-sm text-gray-500">
                Page {page} of {pages}
              </span>
              <div className="flex items-center gap-2">
                <label htmlFor="page-size" className="sr-only">
                  Page size
                </label>
                <select
                  id="page-size"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size} / page
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.min(pages, value + 1))}
                  disabled={page >= pages}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <AddNotificationForm onAdded={addNotification} />
          {session.is_admin && <BroadcastForm onBroadcast={refresh} />}
        </aside>
      </main>
    </div>
  );
}
