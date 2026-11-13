import { useCallback, useEffect, useState } from "react";
import { ApiError, api, getToken, setToken } from "./api";
import type { Notification, NotificationPage, User } from "./api";

const TYPE_OPTIONS = ["info", "success", "warning", "error"];

const PAGE_SIZE = 10;

function badgeClasses(type: string): string {
  switch (type.toLowerCase()) {
    case "success":
      return "bg-emerald-100 text-emerald-800 ring-emerald-200";
    case "warning":
      return "bg-amber-100 text-amber-800 ring-amber-200";
    case "error":
      return "bg-rose-100 text-rose-800 ring-rose-200";
    case "info":
      return "bg-sky-100 text-sky-800 ring-sky-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function BellIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

type AuthMode = "login" | "register";

function AuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register(username.trim(), password);
        await api.login(username.trim(), password);
        onAuthenticated();
      } else {
        await api.login(username.trim(), password);
        onAuthenticated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">
            Notification Center
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in to view your private inbox.
          </p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
            {(["login", "register"] as AuthMode[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setMode(tab);
                  setError(null);
                }}
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  mode === tab
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab === "login" ? "Sign in" : "Register"}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
          {mode === "register" && (
            <p className="mt-4 text-center text-xs text-slate-500">
              You are signed in automatically after registering.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeClasses(
        type,
      )}`}
    >
      {type}
    </span>
  );
}

function Composer({
  title,
  description,
  submitLabel,
  onSubmit,
}: {
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: (message: string, type: string) => Promise<string>;
}) {
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFeedback(null);
    if (!message.trim()) {
      setError("Message is required.");
      return;
    }
    setBusy(true);
    try {
      const result = await onSubmit(message.trim(), type);
      setMessage("");
      setFeedback(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
          placeholder="Write a plain text message…"
          className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Type
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="ml-auto rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Sending…" : submitLabel}
          </button>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {feedback && <p className="text-sm text-emerald-600">{feedback}</p>}
      </form>
    </section>
  );
}

function Inbox({
  page,
  loading,
  readFilter,
  typeFilter,
  onReadFilterChange,
  onTypeFilterChange,
  onRefresh,
  onUnauthorized,
  onPageChange,
}: {
  page: NotificationPage | null;
  loading: boolean;
  readFilter: string;
  typeFilter: string;
  onReadFilterChange: (value: string) => void;
  onTypeFilterChange: (value: string) => void;
  onRefresh: () => void;
  onUnauthorized: () => void;
  onPageChange: (page: number) => void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (
    id: number | null,
    action: () => Promise<unknown>,
    fail: (err: unknown) => boolean,
  ) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      onRefresh();
    } catch (err) {
      if (!fail(err)) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setBusyId(null);
    }
  };

  const toggleRead = (item: Notification) =>
    run(
      item.id,
      () => api.setRead(item.id, !item.read),
      (err) => {
        if (err instanceof ApiError && err.status === 401) {
          onUnauthorized();
          return true;
        }
        return false;
      },
    );

  const remove = (item: Notification) =>
    run(
      item.id,
      () => api.deleteNotification(item.id),
      (err) => {
        if (err instanceof ApiError && err.status === 401) {
          onUnauthorized();
          return true;
        }
        return false;
      },
    );

  const markAll = async () => {
    setMarkingAll(true);
    setError(null);
    try {
      await api.readAll();
      onRefresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setMarkingAll(false);
    }
  };

  const totalPages = page ? Math.max(1, Math.ceil(page.total / page.page_size)) : 1;
  const currentPage = page?.page ?? 1;
  const unread = page?.unread_count ?? 0;

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold text-slate-900">Inbox</h2>
        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
          {unread} unread
        </span>
        <button
          type="button"
          onClick={markAll}
          disabled={markingAll || unread === 0}
          className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {markingAll ? "Marking…" : "Mark all as read"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Read state
          <select
            value={readFilter}
            onChange={(event) => onReadFilterChange(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          >
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Type
          <input
            type="text"
            value={typeFilter}
            onChange={(event) => onTypeFilterChange(event.target.value)}
            placeholder="e.g. info"
            list="notification-types"
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
          <datalist id="notification-types">
            {TYPE_OPTIONS.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="mt-4 divide-y divide-slate-100">
        {loading && (
          <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
        )}
        {!loading && page && page.items.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">
            No notifications match your filters.
          </p>
        )}
        {!loading &&
          page?.items.map((item) => (
            <article
              key={item.id}
              className={`flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:gap-4 ${
                item.read ? "" : "bg-indigo-50/40"
              }`}
            >
              <div className="flex items-center gap-2 sm:w-40 sm:flex-col sm:items-start">
                <TypeBadge type={item.type} />
                <time className="text-xs text-slate-500">
                  {formatDate(item.created_at)}
                </time>
              </div>
              <p
                className={`flex-1 whitespace-pre-wrap break-words text-sm ${
                  item.read ? "text-slate-600" : "font-semibold text-slate-900"
                }`}
              >
                {item.message}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                {!item.read && (
                  <span
                    className="h-2 w-2 rounded-full bg-indigo-500"
                    aria-label="Unread"
                  />
                )}
                <button
                  type="button"
                  onClick={() => toggleRead(item)}
                  disabled={busyId === item.id}
                  className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {item.read ? "Mark unread" : "Mark read"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(item)}
                  disabled={busyId === item.id}
                  className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm text-slate-600">
        <span>
          {page ? `${page.total} total` : "—"}
          {page && page.total > 0
            ? ` · page ${currentPage} of ${totalPages}`
            : ""}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1 || loading}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages || loading}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [page, setPage] = useState<NotificationPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [readFilter, setReadFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [refreshTick, setRefreshTick] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
    setPage(null);
    setReadFilter("all");
    setTypeFilter("");
    setPageNumber(1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) {
      setCheckingSession(false);
      return;
    }
    api
      .me()
      .then((result) => {
        if (!cancelled) {
          setUser(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setToken(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCheckingSession(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    api
      .listNotifications({
        read: readFilter,
        type: typeFilter,
        page: pageNumber,
        pageSize: PAGE_SIZE,
      })
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (result.items.length === 0 && result.total > 0 && pageNumber > 1) {
          setPageNumber(Math.max(1, Math.ceil(result.total / PAGE_SIZE)));
          return;
        }
        setPage(result);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        if (err instanceof ApiError && err.status === 401) {
          signOut();
        } else {
          setLoadError(err instanceof Error ? err.message : "Failed to load");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, readFilter, typeFilter, pageNumber, refreshTick, signOut]);

  const refresh = useCallback(() => {
    setRefreshTick((value) => value + 1);
  }, []);

  const changeReadFilter = (value: string) => {
    setReadFilter(value);
    setPageNumber(1);
  };

  const changeTypeFilter = (value: string) => {
    setTypeFilter(value);
    setPageNumber(1);
  };

  const unread = page?.unread_count ?? 0;

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        onAuthenticated={() => {
          api
            .me()
            .then((result) => setUser(result))
            .catch(() => setToken(null));
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
          <h1 className="text-lg font-bold text-slate-900">
            Notification Center
          </h1>
          <div className="ml-auto flex items-center gap-3">
            <div className="relative" aria-label={`${unread} unread notifications`}>
              <BellIcon className="h-6 w-6 text-slate-600" />
              {unread > 0 && (
                <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1 text-[11px] font-bold text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </div>
            <span className="hidden text-sm font-medium text-slate-700 sm:inline">
              {user.username}
              {user.is_admin && (
                <span className="ml-1 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  admin
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm text-slate-500">Signed in as</p>
              <p className="text-lg font-semibold text-slate-900">
                {user.username}
              </p>
            </div>
            <a
              href="#inbox"
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              View inbox
            </a>
          </div>
        </div>

        {loadError && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {loadError}
          </p>
        )}

        <div id="inbox">
          <Inbox
            page={page}
            loading={loading}
            readFilter={readFilter}
            typeFilter={typeFilter}
            onReadFilterChange={changeReadFilter}
            onTypeFilterChange={changeTypeFilter}
            onRefresh={refresh}
            onUnauthorized={signOut}
            onPageChange={setPageNumber}
          />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Composer
            title="Add a notification"
            description="Send a notification to your own inbox."
            submitLabel="Add notification"
            onSubmit={async (message, type) => {
              await api.createNotification(message, type);
              refresh();
              return "Notification added.";
            }}
          />
          {user.is_admin ? (
            <Composer
              title="Broadcast an announcement"
              description="Deliver the same notification to every user's inbox."
              submitLabel="Broadcast"
              onSubmit={async (message, type) => {
                const result = await api.broadcast(message, type);
                refresh();
                return `Delivered to ${result.delivered} inbox${
                  result.delivered === 1 ? "" : "es"
                }.`;
              }}
            />
          ) : (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-5 text-sm text-slate-500">
              <h2 className="text-base font-semibold text-slate-700">
                Admin tools
              </h2>
              <p className="mt-1">
                Broadcasting announcements is available to the admin account
                only.
              </p>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
