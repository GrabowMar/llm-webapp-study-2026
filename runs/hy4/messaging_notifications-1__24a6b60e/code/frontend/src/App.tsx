import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, api, type ListParams, type NotificationPage } from "./api";

const TOKEN_KEY = "notification-center-token";
const USERNAME_KEY = "notification-center-username";
const PAGE_SIZE = 10;

const TYPE_STYLES: Record<string, string> = {
  info: "bg-sky-100 text-sky-800 ring-sky-200",
  warning: "bg-amber-100 text-amber-800 ring-amber-200",
  alert: "bg-rose-100 text-rose-800 ring-rose-200",
  error: "bg-rose-100 text-rose-800 ring-rose-200",
  success: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  announcement: "bg-violet-100 text-violet-800 ring-violet-200",
};
const DEFAULT_TYPE_STYLE = "bg-slate-100 text-slate-700 ring-slate-200";
const TYPE_OPTIONS = ["info", "warning", "alert", "success", "announcement"];

interface Session {
  token: string;
  username: string;
}

function readSession(): Session | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const username = localStorage.getItem(USERNAME_KEY);
  return token && username ? { token, username } : null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function BellIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function AuthScreen({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register(username.trim(), password);
      }
      const { token } = await api.login(username.trim(), password);
      onSignedIn({ token, username: username.trim() });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl ring-1 ring-slate-200">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white">
            <BellIcon />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Notification Center</h1>
          <p className="text-sm text-slate-500">Your private inbox for everything that matters.</p>
        </div>

        <div className="mb-6 flex rounded-lg bg-slate-100 p-1">
          {(["login", "register"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setMode(option);
                setError("");
              }}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                mode === option
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {option === "login" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="auth-username" className="mb-1 block text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              id="auth-username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              placeholder="Your username"
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              placeholder="Your password"
            />
          </div>
          {error && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-400">
          {mode === "login"
            ? "New here? Switch to Register to create an account."
            : "Already have an account? Switch to Sign in."}
        </p>
      </div>
    </div>
  );
}

function NotificationComposer({
  title,
  description,
  submitLabel,
  onSubmit,
}: {
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: (message: string, type: string) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await onSubmit(message.trim(), type);
      setMessage("");
      setNotice("Sent.");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <textarea
          aria-label="Message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          required
          maxLength={5000}
          placeholder="Write a plain text message…"
          className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy || !message.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Sending…" : submitLabel}
          </button>
          {notice && <span className="text-xs font-medium text-emerald-600">{notice}</span>}
        </div>
        {error && (
          <p role="alert" className="text-xs text-rose-600">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [readFilter, setReadFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<NotificationPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");

  const isAdmin = session?.username.toLowerCase() === "admin";
  const params = useMemo<ListParams>(
    () => ({
      read: readFilter === "all" ? undefined : readFilter,
      type: typeFilter || undefined,
      page,
      page_size: PAGE_SIZE,
    }),
    [readFilter, typeFilter, page],
  );

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const result = await api.list(params, session.token);
      setData(result);
      setError("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setSession(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USERNAME_KEY);
      } else {
        setError(messageOf(err));
      }
    } finally {
      setLoading(false);
    }
  }, [session, params]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function signedIn(next: Session) {
    localStorage.setItem(TOKEN_KEY, next.token);
    localStorage.setItem(USERNAME_KEY, next.username);
    setSession(next);
    setPage(1);
    setData(null);
    setError("");
  }

  async function signOut() {
    if (session) {
      try {
        await api.logout(session.token);
      } catch {
        // best effort; local sign-out always proceeds
      }
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
    setSession(null);
    setData(null);
  }

  async function runAction(action: () => Promise<unknown>, id: number | null = null) {
    if (!session) return;
    if (id !== null) setBusyId(id);
    setActionError("");
    try {
      await action();
      await refresh();
    } catch (err) {
      setActionError(messageOf(err));
    } finally {
      if (id !== null) setBusyId(null);
    }
  }

  async function addNotification(message: string, type: string) {
    if (!session) return;
    await api.create(message, type, session.token);
    setPage(1);
    await refresh();
  }

  async function broadcast(message: string, type: string) {
    if (session) await api.broadcast(message, type, session.token);
  }

  if (!session) return <AuthScreen onSignedIn={signedIn} />;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const unreadCount = data?.unread_count ?? 0;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <BellIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight sm:text-base">Notification Center</h1>
              <p className="text-xs text-slate-500">
                Signed in as <span className="font-semibold text-slate-700">{session.username}</span>
                {isAdmin && (
                  <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-700">
                    admin
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative" aria-label={`${unreadCount} unread notifications`}>
              <BellIcon className="h-6 w-6 text-slate-600" />
              <span className="absolute -right-2 -top-2 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">
                {unreadCount}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <div className="grid gap-4 md:grid-cols-2">
          <NotificationComposer
            title="Add to my inbox"
            description="Create a notification in your own inbox."
            submitLabel="Add notification"
            onSubmit={addNotification}
          />
          {isAdmin ? (
            <NotificationComposer
              title="Broadcast announcement"
              description="Send the same message to every user's inbox."
              submitLabel="Broadcast"
              onSubmit={broadcast}
            />
          ) : (
            <div className="hidden rounded-xl border border-dashed border-slate-300 p-5 md:block" />
          )}
        </div>

        <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold">Inbox</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {data?.total ?? 0} total
              </span>
            </div>
            <button
              type="button"
              disabled={!session || unreadCount === 0}
              onClick={() => void runAction(() => api.readAll(session.token))}
              className="rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Mark all as read
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-4 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
            <div>
              <label htmlFor="filter-read" className="mb-1 block text-xs font-medium text-slate-500">
                Read state
              </label>
              <select
                id="filter-read"
                value={readFilter}
                onChange={(e) => {
                  setReadFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              >
                <option value="all">All</option>
                <option value="false">Unread</option>
                <option value="true">Read</option>
              </select>
            </div>
            <div>
              <label htmlFor="filter-type" className="mb-1 block text-xs font-medium text-slate-500">
                Type
              </label>
              <select
                id="filter-type"
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">All types</option>
                {TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            {(readFilter !== "all" || typeFilter) && (
              <button
                type="button"
                onClick={() => {
                  setReadFilter("all");
                  setTypeFilter("");
                  setPage(1);
                }}
                className="pb-1.5 text-xs font-medium text-indigo-600 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>

          {(error || actionError) && (
            <p role="alert" className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-sm text-rose-700">
              {actionError || error}
            </p>
          )}

          {loading && !data ? (
            <p className="px-5 py-12 text-center text-sm text-slate-500">Loading notifications…</p>
          ) : data && data.items.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-slate-500">
              No notifications match your filters.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data?.items.map((item) => (
                <li
                  key={item.id}
                  className={`flex flex-wrap items-start justify-between gap-3 px-5 py-4 transition ${
                    item.read ? "bg-white" : "bg-indigo-50/40"
                  } ${busyId === item.id ? "opacity-60" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${
                          TYPE_STYLES[item.type] ?? DEFAULT_TYPE_STYLE
                        }`}
                      >
                        {item.type}
                      </span>
                      {!item.read && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
                          Unread
                        </span>
                      )}
                    </div>
                    <p
                      className={`whitespace-pre-wrap break-words text-sm ${
                        item.read ? "font-normal text-slate-700" : "font-bold text-slate-900"
                      }`}
                    >
                      {item.message}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">{formatDate(item.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() =>
                        void runAction(() => api.patch(item.id, !item.read, session.token), item.id)
                      }
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                    >
                      {item.read ? "Mark unread" : "Mark read"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void runAction(() => api.remove(item.id, session.token), item.id)}
                      className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
            <span className="text-xs text-slate-500">
              Page {data?.page ?? page} of {totalPages} · {data?.total ?? 0} notifications
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs font-medium text-slate-600">{page}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
