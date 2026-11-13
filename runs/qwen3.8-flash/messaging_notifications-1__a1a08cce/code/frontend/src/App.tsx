import { useCallback, useEffect, useState } from "react";
import { api, ApiError, setToken, type NotificationPage } from "./api";
import AuthForm from "./AuthForm";

const PAGE_SIZE = 10;
const TYPE_COLORS: Record<string, string> = {
  general: "bg-slate-200 text-slate-700",
  announcement: "bg-amber-200 text-amber-800",
  system: "bg-sky-200 text-sky-800",
  info: "bg-emerald-200 text-emerald-800",
  warning: "bg-orange-200 text-orange-800",
};

function badgeColor(type: string) {
  return TYPE_COLORS[type.toLowerCase()] ?? "bg-indigo-100 text-indigo-700";
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export default function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  const [page, setPage] = useState<NotificationPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [readFilter, setReadFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [typeOptions, setTypeOptions] = useState<string[]>([]);
  const [pageNum, setPageNum] = useState(1);

  const [newMessage, setNewMessage] = useState("");
  const [newType, setNewType] = useState("general");
  const [notice, setNotice] = useState<string | null>(null);

  const [bcMessage, setBcMessage] = useState("");
  const [bcType, setBcType] = useState("announcement");

  const fetchPage = useCallback(
    async (p = pageNum, read = readFilter, type = typeFilter) => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.list({
          page: p,
          page_size: PAGE_SIZE,
          ...(read ? { read } : {}),
          ...(type ? { type } : {}),
        });
        setPage(data);
        setPageNum(data.page);
        setTypeOptions((prev) => {
          const set = new Set(prev);
          for (const item of data.items) set.add(item.type);
          return [...set];
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          signOut();
        } else {
          setError(err instanceof Error ? err.message : "failed to load");
        }
      } finally {
        setLoading(false);
      }
    },
    [pageNum, readFilter, typeFilter],
  );

  function signOut() {
    setToken(null);
    setUsername(null);
    setIsAdmin(false);
    setPage(null);
  }

  useEffect(() => {
    (async () => {
      try {
        const me = await api.me();
        setUsername(me.username);
        setIsAdmin(me.is_admin);
      } catch {
        // not signed in
      } finally {
        setChecking(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (username) void fetchPage(pageNum, readFilter, typeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(null), 4000);
      return () => clearTimeout(t);
    }
  }, [notice]);

  async function toggleRead(id: number, read: boolean) {
    try {
      await api.patch(id, read);
      await fetchPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "update failed");
    }
  }

  async function remove(id: number) {
    try {
      await api.remove(id);
      await fetchPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
    }
  }

  async function markAllRead() {
    try {
      const { updated } = await api.markAllRead();
      setNotice(`Marked ${updated} notification${updated === 1 ? "" : "s"} as read`);
      await fetchPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    }
  }

  async function addNotification(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim()) return;
    try {
      await api.create(newMessage.trim(), newType.trim() || "general");
      setNewMessage("");
      setNotice("Notification added");
      await fetchPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    }
  }

  async function broadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!bcMessage.trim()) return;
    try {
      const { delivered } = await api.broadcast(bcMessage.trim(), bcType.trim() || "announcement");
      setBcMessage("");
      setNotice(`Broadcast delivered to ${delivered} inbox${delivered === 1 ? "" : "es"}`);
      await fetchPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "broadcast failed");
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
        Loading…
      </div>
    );
  }

  if (!username) {
    return (
      <AuthForm
        onSignedIn={(token) => {
          setToken(token);
          void (async () => {
            const me = await api.me();
            setUsername(me.username);
            setIsAdmin(me.is_admin);
          })();
        }}
      />
    );
  }

  const items = page?.items ?? [];
  const total = page?.total ?? 0;
  const pageSize = page?.page_size ?? PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const unread = page?.unread_count ?? 0;

  const filterSelect =
    "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none";

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white">
                <BellIcon className="h-5 w-5" />
              </span>
              {unread > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </div>
            <h1 className="text-lg font-bold text-slate-800">Notifications</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              {username}
              {isAdmin && (
                <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                  admin
                </span>
              )}
            </span>
            <button
              onClick={signOut}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 pt-6">
        {notice && (
          <p className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">
            {notice}
          </p>
        )}
        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </p>
        )}

        {isAdmin && (
          <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Broadcast announcement
            </h2>
            <form onSubmit={broadcast} className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={bcMessage}
                onChange={(e) => setBcMessage(e.target.value)}
                placeholder="Message for every user…"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                required
              />
              <input
                value={bcType}
                onChange={(e) => setBcType(e.target.value)}
                placeholder="type"
                className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-400"
              >
                Broadcast
              </button>
            </form>
          </section>
        )}

        <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            New notification
          </h2>
          <form onSubmit={addNotification} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Message…"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              required
            />
            <input
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              placeholder="type"
              className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Add
            </button>
          </form>
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select
              className={filterSelect}
              value={readFilter}
              onChange={(e) => {
                setReadFilter(e.target.value);
                void fetchPage(1, e.target.value, typeFilter);
              }}
            >
              <option value="">All</option>
              <option value="false">Unread</option>
              <option value="true">Read</option>
            </select>
            <select
              className={filterSelect}
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                void fetchPage(1, readFilter, e.target.value);
              }}
            >
              <option value="">All types</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              onClick={markAllRead}
              disabled={unread === 0}
              className="ml-auto rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Mark all as read
            </button>
          </div>

          <ul className="space-y-2">
            {loading && items.length === 0 && (
              <li className="rounded-xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
                Loading…
              </li>
            )}
            {!loading && items.length === 0 && (
              <li className="rounded-xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
                No notifications.
              </li>
            )}
            {items.map((n) => (
              <li
                key={n.id}
                className="flex items-start gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs font-medium " + badgeColor(n.type)
                      }
                    >
                      {n.type}
                    </span>
                    <time className="text-xs text-slate-400">
                      {new Date(n.created_at).toLocaleString()}
                    </time>
                  </div>
                  <p
                    className={
                      "mt-1 break-words text-sm text-slate-800 " +
                      (n.read ? "font-normal" : "font-bold")
                    }
                  >
                    {n.message}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => void toggleRead(n.id, !n.read)}
                    title={n.read ? "Mark as unread" : "Mark as read"}
                    className={
                      "rounded-lg px-2.5 py-1.5 text-xs font-medium transition " +
                      (n.read
                        ? "text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100"
                        : "bg-indigo-600 text-white hover:bg-indigo-500")
                    }
                  >
                    {n.read ? "Unread" : "Read"}
                  </button>
                  <button
                    onClick={() => void remove(n.id)}
                    title="Delete"
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 ring-1 ring-red-200 transition hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {total > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-slate-500">
                Page {pageNum} of {pages} · {total} notification{total === 1 ? "" : "s"}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => void fetchPage(pageNum - 1)}
                  disabled={pageNum <= 1 || loading}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => void fetchPage(pageNum + 1)}
                  disabled={pageNum >= pages || loading}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
