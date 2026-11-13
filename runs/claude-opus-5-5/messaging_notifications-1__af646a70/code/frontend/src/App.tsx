import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, ApiError, getToken, Me, NotificationPage, setToken } from "./api";

const TYPES = ["info", "success", "warning", "alert", "announcement"] as const;
const PAGE_SIZE = 10;

const BADGE: Record<string, string> = {
  info: "bg-sky-100 text-sky-800 ring-sky-200",
  success: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-100 text-amber-800 ring-amber-200",
  alert: "bg-rose-100 text-rose-800 ring-rose-200",
  announcement: "bg-violet-100 text-violet-800 ring-violet-200",
};

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";
const btnPrimary =
  "rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";
const btnSecondary =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function Alert({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  const cls =
    kind === "error"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${cls}`}>
      {children}
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const cls = BADGE[type] ?? "bg-slate-100 text-slate-700 ring-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {type}
    </span>
  );
}

function BellIcon({ count }: { count: number }) {
  return (
    <div className="relative" aria-label={`${count} unread notifications`} title={`${count} unread`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-7 w-7 text-slate-600"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
        />
      </svg>
      <span
        data-testid="unread-count"
        className={`absolute -right-2 -top-1.5 min-w-5 rounded-full px-1.5 text-center text-xs font-semibold leading-5 ${
          count > 0 ? "bg-rose-600 text-white" : "bg-slate-200 text-slate-600"
        }`}
      >
        {count > 99 ? "99+" : count}
      </span>
    </div>
  );
}

function AuthScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register(username, password);
      }
      const { token } = await api.login(username, password);
      setToken(token);
      onLoggedIn();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
              setInfo(null);
            }}
            className={`flex-1 rounded-md px-3 py-1.5 ${
              mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {m === "login" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">
          {mode === "login" ? "Sign in to your inbox" : "Create an account"}
        </h2>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Username</span>
          <input
            className={inputCls}
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Password</span>
          <input
            className={inputCls}
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={mode === "register" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {mode === "register" && (
            <span className="mt-1 block text-xs text-slate-500">At least 8 characters.</span>
          )}
        </label>
        {error && <Alert kind="error">{error}</Alert>}
        {info && <Alert kind="success">{info}</Alert>}
        <button type="submit" className={`${btnPrimary} w-full`} disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}
        </button>
      </form>
    </div>
  );
}

function NotificationForm({
  title,
  submitLabel,
  defaultType,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  defaultType: string;
  onSubmit: (message: string, type: string) => Promise<string | void>;
}) {
  const [message, setMessage] = useState("");
  const [type, setType] = useState(defaultType);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const result = await onSubmit(message, type);
      setMessage("");
      if (result) setInfo(result);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <textarea
        className={`${inputCls} min-h-20`}
        placeholder="Message"
        aria-label="Message"
        maxLength={2000}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
      />
      <div className="flex gap-2">
        <select className={inputCls} aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button type="submit" className={`${btnPrimary} shrink-0`} disabled={busy || !message.trim()}>
          {submitLabel}
        </button>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {info && <Alert kind="success">{info}</Alert>}
    </form>
  );
}

function Inbox({
  data,
  loading,
  error,
  readFilter,
  typeFilter,
  setReadFilter,
  setTypeFilter,
  setPage,
  onToggle,
  onDelete,
  onReadAll,
}: {
  data: NotificationPage | null;
  loading: boolean;
  error: string | null;
  readFilter: string;
  typeFilter: string;
  setReadFilter: (v: string) => void;
  setTypeFilter: (v: string) => void;
  setPage: (p: number) => void;
  onToggle: (id: number, read: boolean) => void;
  onDelete: (id: number) => void;
  onReadAll: () => void;
}) {
  const page = data?.page ?? 1;
  const pageSize = data?.page_size ?? PAGE_SIZE;
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
        <h2 className="mr-auto text-base font-semibold text-slate-900">Inbox</h2>
        <label className="text-xs font-medium text-slate-600">
          Status
          <select
            className={`${inputCls} mt-1`}
            value={readFilter}
            onChange={(e) => setReadFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="false">Unread</option>
            <option value="true">Read</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Type
          <select
            className={`${inputCls} mt-1`}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={btnSecondary}
          onClick={onReadAll}
          disabled={!data || data.unread_count === 0}
        >
          Mark all as read
        </button>
      </div>

      {error && (
        <div className="p-4">
          <Alert kind="error">{error}</Alert>
        </div>
      )}

      {data && data.items.length === 0 && !loading && (
        <p className="p-8 text-center text-sm text-slate-500">No notifications.</p>
      )}
      {!data && loading && <p className="p-8 text-center text-sm text-slate-500">Loading…</p>}

      <ul className="divide-y divide-slate-100">
        {data?.items.map((n) => (
          <li
            key={n.id}
            className={`flex items-start gap-3 px-4 py-3 ${n.read ? "bg-white" : "bg-indigo-50/50"}`}
          >
            <span
              aria-hidden="true"
              className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-indigo-500"}`}
            />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <TypeBadge type={n.type} />
                <time className="text-xs text-slate-500" dateTime={n.created_at}>
                  {formatDate(n.created_at)}
                </time>
                {!n.read && <span className="sr-only">Unread</span>}
              </div>
              <p
                className={`whitespace-pre-wrap break-words text-sm ${
                  n.read ? "font-normal text-slate-600" : "font-bold text-slate-900"
                }`}
              >
                {n.message}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" className={btnSecondary} onClick={() => onToggle(n.id, !n.read)}>
                {n.read ? "Mark unread" : "Mark read"}
              </button>
              <button
                type="button"
                className="rounded-md border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 shadow-sm hover:bg-rose-50"
                onClick={() => onDelete(n.id)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
        <span>
          {total} notification{total === 1 ? "" : "s"} · Page {page} of {pages}
        </span>
        <div className="flex gap-2">
          <button type="button" className={btnSecondary} disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <button
            type="button"
            className={btnSecondary}
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);
  const [data, setData] = useState<NotificationPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readFilter, setReadFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);

  const signOutLocal = useCallback(() => {
    setToken(null);
    setMe(null);
    setData(null);
    setPage(1);
    setReadFilter("");
    setTypeFilter("");
  }, []);

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) signOutLocal();
      else setError(errMsg(e));
    },
    [signOutLocal],
  );

  const loadMe = useCallback(async () => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    try {
      setMe(await api.me());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) signOutLocal();
    } finally {
      setChecking(false);
    }
  }, [signOutLocal]);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    try {
      const res = await api.list({ read: readFilter, type: typeFilter, page, page_size: PAGE_SIZE });
      const pages = Math.max(1, Math.ceil(res.total / res.page_size));
      if (res.items.length === 0 && page > pages) {
        setPage(pages);
        return;
      }
      setData(res);
      setError(null);
    } catch (e) {
      handleError(e);
    } finally {
      setLoading(false);
    }
  }, [me, readFilter, typeFilter, page, handleError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!me) return;
    const t = window.setInterval(load, 30000);
    return () => window.clearInterval(t);
  }, [me, load]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      await load();
    } catch (e) {
      handleError(e);
    }
  }

  async function signOut() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    signOutLocal();
  }

  if (checking) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <h1 className="mr-auto text-lg font-semibold">Notification Center</h1>
          {me && (
            <>
              <BellIcon count={data?.unread_count ?? 0} />
              <span className="text-sm text-slate-600">
                Signed in as <strong className="font-semibold text-slate-900">{me.username}</strong>
                {me.is_admin && (
                  <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-xs font-medium text-white">
                    admin
                  </span>
                )}
              </span>
              <button type="button" className={btnSecondary} onClick={signOut}>
                Sign out
              </button>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {!me ? (
          <AuthScreen onLoggedIn={loadMe} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
            <Inbox
              data={data}
              loading={loading}
              error={error}
              readFilter={readFilter}
              typeFilter={typeFilter}
              setReadFilter={(v) => {
                setReadFilter(v);
                setPage(1);
              }}
              setTypeFilter={(v) => {
                setTypeFilter(v);
                setPage(1);
              }}
              setPage={setPage}
              onToggle={(id, read) => act(() => api.setRead(id, read))}
              onDelete={(id) => act(() => api.remove(id))}
              onReadAll={() => act(() => api.readAll())}
            />
            <aside className="space-y-6">
              <NotificationForm
                title="Add a notification"
                submitLabel="Add"
                defaultType="info"
                onSubmit={async (message, type) => {
                  try {
                    await api.create(message, type);
                  } catch (e) {
                    if (e instanceof ApiError && e.status === 401) signOutLocal();
                    throw e;
                  }
                  await load();
                }}
              />
              {me.is_admin && (
                <NotificationForm
                  title="Broadcast announcement"
                  submitLabel="Broadcast"
                  defaultType="announcement"
                  onSubmit={async (message, type) => {
                    let delivered: number;
                    try {
                      ({ delivered } = await api.broadcast(message, type));
                    } catch (e) {
                      if (e instanceof ApiError && e.status === 401) signOutLocal();
                      throw e;
                    }
                    await load();
                    return `Delivered to ${delivered} inbox${delivered === 1 ? "" : "es"}.`;
                  }}
                />
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
