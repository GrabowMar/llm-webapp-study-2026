import { useCallback, useEffect, useState } from "react";
import * as api from "./api";
import type { Notification } from "./api";
import AddNotificationForm from "./components/AddNotificationForm";
import AuthPanel from "./components/AuthPanel";
import Bell from "./components/Bell";
import BroadcastForm from "./components/BroadcastForm";
import Inbox from "./components/Inbox";

type Session = { token: string; username: string };

const PAGE_SIZE = 10;

export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const token = api.getToken();
    const username = api.getStoredUsername();
    return token && username ? { token, username } : null;
  });

  const handleSignedIn = useCallback((username: string) => {
    const token = api.getToken();
    if (token) setSession({ token, username });
  }, []);

  const handleSignOut = useCallback(() => {
    api.clearSession();
    setSession(null);
  }, []);

  if (!session) {
    return <AuthPanel onSignedIn={handleSignedIn} />;
  }

  return <Main username={session.username} onSignOut={handleSignOut} />;
}

function Main({ username, onSignOut }: { username: string; onSignOut: () => void }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [readFilter, setReadFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof api.HttpError && err.status === 401) {
        onSignOut();
        return;
      }
      setError(err instanceof Error ? err.message : "Request failed");
    },
    [onSignOut]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listNotifications({
        read: readFilter,
        type: typeFilter.trim(),
        page,
        pageSize: PAGE_SIZE,
      })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
        setUnreadCount(res.unread_count);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) fail(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [readFilter, typeFilter, page, version, fail]);

  useEffect(() => {
    const id = window.setInterval(refresh, 15000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      try {
        await action();
        setError(null);
      } catch (err) {
        fail(err);
      }
    },
    [fail]
  );

  const handleToggleRead = useCallback(
    (notification: Notification) =>
      run(async () => {
        await api.setRead(notification.id, !notification.read);
        refresh();
      }),
    [run, refresh]
  );

  const handleDelete = useCallback(
    (notification: Notification) =>
      run(async () => {
        await api.deleteNotification(notification.id);
        refresh();
      }),
    [run, refresh]
  );

  const handleMarkAllRead = useCallback(
    () =>
      run(async () => {
        await api.markAllRead();
        refresh();
      }),
    [run, refresh]
  );

  const handleAdd = useCallback(
    async (message: string, type: string) => {
      try {
        await api.createNotification(message, type);
        setPage(1);
        refresh();
        setError(null);
        return true;
      } catch (err) {
        fail(err);
        return false;
      }
    },
    [fail, refresh]
  );

  const handleBroadcast = useCallback(
    async (message: string, type: string) => {
      try {
        const res = await api.broadcast(message, type);
        refresh();
        setError(null);
        return res.delivered;
      } catch (err) {
        fail(err);
        return null;
      }
    },
    [fail, refresh]
  );

  const handleReadFilterChange = useCallback((value: string) => {
    setReadFilter(value);
    setPage(1);
  }, []);

  const handleTypeFilterChange = useCallback((value: string) => {
    setTypeFilter(value);
    setPage(1);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <h1 className="text-lg font-bold text-slate-900">Notification Center</h1>
          <div className="flex items-center gap-2 sm:gap-3">
            <Bell
              count={unreadCount}
              onClick={() => {
                handleReadFilterChange("false");
                document.getElementById("inbox")?.scrollIntoView({ behavior: "smooth" });
              }}
            />
            <span className="hidden text-sm text-slate-600 sm:inline">{username}</span>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <AddNotificationForm onAdd={handleAdd} />
        <Inbox
          items={items}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          readFilter={readFilter}
          typeFilter={typeFilter}
          loading={loading}
          onReadFilterChange={handleReadFilterChange}
          onTypeFilterChange={handleTypeFilterChange}
          onPageChange={setPage}
          onMarkAllRead={handleMarkAllRead}
          onToggleRead={handleToggleRead}
          onDelete={handleDelete}
        />
        {username === "admin" && <BroadcastForm onBroadcast={handleBroadcast} />}
      </main>
    </div>
  );
}
