import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  broadcast as broadcastRequest,
  createNotification as createNotificationRequest,
  deleteNotification as deleteNotificationRequest,
  fetchMe,
  fetchNotifications,
  fetchTypes,
  login,
  markAllRead,
  register,
  setNotificationRead,
} from "./api";
import { AuthPanel } from "./components/AuthPanel";
import { Filters } from "./components/Filters";
import { AddNotificationForm, BroadcastForm } from "./components/Forms";
import { Header } from "./components/Header";
import { NotificationRow } from "./components/NotificationRow";
import { Pagination } from "./components/Pagination";
import type { Notification, ReadFilter, Session } from "./types";

const TOKEN_KEY = "notification-center.token";
const USER_KEY = "notification-center.user";

function loadStoredSession(): Session | null {
  try {
    const token = window.localStorage.getItem(TOKEN_KEY);
    const user = window.localStorage.getItem(USER_KEY);
    if (!token || !user) return null;
    return { token, user: JSON.parse(user) as Session["user"] };
  } catch {
    return null;
  }
}

function storeSession(session: Session | null) {
  try {
    if (session) {
      window.localStorage.setItem(TOKEN_KEY, session.token);
      window.localStorage.setItem(USER_KEY, JSON.stringify(session.user));
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
    }
  } catch {
    /* storage unavailable */
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadStoredSession());
  const [authChecked, setAuthChecked] = useState(false);

  const [items, setItems] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busyIds, setBusyIds] = useState<number[]>([]);
  const requestId = useRef(0);

  const token = session?.token ?? null;

  const load = useCallback(async () => {
    if (!token) return;
    const current = ++requestId.current;
    setRefreshing(true);
    try {
      const pageData = await fetchNotifications(token, {
        read: readFilter,
        type: typeFilter,
        page,
        pageSize,
      });
      if (current !== requestId.current) return;
      setItems(pageData.items);
      setTotal(pageData.total);
      setUnreadCount(pageData.unread_count);
      setError("");
    } catch (loadError) {
      if (current !== requestId.current) return;
      if (loadError instanceof ApiError && loadError.status === 401) {
        storeSession(null);
        setSession(null);
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Could not load notifications.");
    } finally {
      if (current === requestId.current) setRefreshing(false);
    }
  }, [token, readFilter, typeFilter, page, pageSize]);

  const loadTypes = useCallback(async () => {
    if (!token) return;
    try {
      const available = await fetchTypes(token);
      setTypes(available);
    } catch {
      /* keep previous types */
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    if (!session) {
      setAuthChecked(true);
      setItems([]);
      setTotal(0);
      setUnreadCount(0);
      setTypes([]);
      return;
    }
    setAuthChecked(false);
    fetchMe(session.token)
      .then((user) => {
        if (cancelled) return;
        const next = { token: session.token, user };
        setSession(next);
        storeSession(next);
        setAuthChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        storeSession(null);
        setSession(null);
        setAuthChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.token]);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [session, load]);

  useEffect(() => {
    if (!session) return;
    void loadTypes();
  }, [session, loadTypes]);

  const handleSignIn = useCallback(async (username: string, password: string) => {
    const next = await login(username, password);
    storeSession(next);
    setSession(next);
    setPage(1);
  }, []);

  const handleRegister = useCallback(async (username: string, password: string) => {
    const next = await register(username, password);
    storeSession(next);
    setSession(next);
    setPage(1);
  }, []);

  const handleSignOut = useCallback(() => {
    storeSession(null);
    setSession(null);
    setItems([]);
    setTotal(0);
    setUnreadCount(0);
    setTypeFilter("");
    setReadFilter("all");
    setPage(1);
  }, []);

  const handleToggle = useCallback(
    async (notification: Notification) => {
      if (!token) return;
      setBusyIds((current) => [...current, notification.id]);
      try {
        await setNotificationRead(token, notification.id, !notification.read);
        await load();
      } catch (toggleError) {
        setError(toggleError instanceof Error ? toggleError.message : "Could not update notification.");
      } finally {
        setBusyIds((current) => current.filter((id) => id !== notification.id));
      }
    },
    [token, load],
  );

  const handleDelete = useCallback(
    async (notification: Notification) => {
      if (!token) return;
      setBusyIds((current) => [...current, notification.id]);
      try {
        await deleteNotificationRequest(token, notification.id);
        if (items.length === 1 && page > 1) setPage((current) => current - 1);
        await load();
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : "Could not delete notification.");
      } finally {
        setBusyIds((current) => current.filter((id) => id !== notification.id));
      }
    },
    [token, items.length, page, load],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (!token) return;
    try {
      await markAllRead(token);
      await load();
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "Could not mark notifications as read.");
    }
  }, [token, load]);

  const handleCreate = useCallback(
    async (message: string, type: string) => {
      if (!token) return "";
      await createNotificationRequest(token, message, type);
      await Promise.all([load(), loadTypes()]);
      return "Notification added to your inbox.";
    },
    [token, load, loadTypes],
  );

  const handleBroadcast = useCallback(
    async (message: string, type: string) => {
      if (!token) return "";
      const delivered = await broadcastRequest(token, message, type);
      await Promise.all([load(), loadTypes()]);
      return `Announcement delivered to ${delivered} inboxes.`;
    },
    [token, load, loadTypes],
  );

  const typeOptions = useMemo(() => {
    const known = new Set<string>(types);
    return [...known].sort((a, b) => a.localeCompare(b));
  }, [types]);

  if (!session) {
    return (
      <AuthPanel
        onSignIn={handleSignIn}
        onRegister={handleRegister}
      />
    );
  }

  const isAdmin = session.user.is_admin === true;

  return (
    <div className="min-h-screen bg-slate-100">
      <Header
        username={session.user.username}
        isAdmin={isAdmin}
        unreadCount={unreadCount}
        onSignOut={handleSignOut}
      />

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Inbox</h2>
              <p className="text-xs text-slate-500">
                {total} notification{total === 1 ? "" : "s"} · {unreadCount} unread
              </p>
            </div>
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
              className="rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Mark all as read
            </button>
          </div>

          <div className="border-b border-slate-100 px-4 py-3">
            <Filters
              readFilter={readFilter}
              typeFilter={typeFilter}
              types={typeOptions}
              onReadFilterChange={(value) => {
                setReadFilter(value);
                setPage(1);
              }}
              onTypeFilterChange={(value) => {
                setTypeFilter(value);
                setPage(1);
              }}
            />
          </div>

          {error ? (
            <p className="m-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          ) : null}

          {loading && items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">Loading notifications…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              {refreshing
                ? "No notifications match your filters."
                : "No notifications yet. Add one to get started."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  busy={busyIds.includes(notification.id)}
                />
              ))}
            </ul>
          )}

          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </section>

        <aside className="space-y-4">
          <AddNotificationForm onSubmit={handleCreate} />
          {isAdmin ? <BroadcastForm onSubmit={handleBroadcast} /> : null}
        </aside>
      </main>
    </div>
  );
}
