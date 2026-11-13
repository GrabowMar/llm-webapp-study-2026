import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, api, setAuthToken, setUnauthorizedHandler, type Preview } from "./api";

const TOKEN_KEY = "lp_token";
const USER_KEY = "lp_username";
const PAGE_SIZE = 9;

type Session = { token: string; username: string };

function loadSession(): Session | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const username = localStorage.getItem(USER_KEY);
    if (token && username) return { token, username };
  } catch {
    return null;
  }
  return null;
}

function saveSession(session: Session | null) {
  try {
    if (session) {
      localStorage.setItem(TOKEN_KEY, session.token);
      localStorage.setItem(USER_KEY, session.username);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  } catch {
    return;
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError || err instanceof Error) return err.message;
  return "Something went wrong.";
}

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

function hostOf(value: string | null | undefined): string {
  if (!value) return "";
  try {
    return new URL(value).host.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function Alert({ message, onClose }: { message: string; onClose?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      <span className="break-words">{message}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-red-500 hover:text-red-700"
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}

function AuthScreen({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const name = username.trim();
    if (!name || !password) {
      setError("Please enter a username and password.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register(name, password);
      }
      const res = await api.login(name, password);
      onSignedIn({ token: res.token, username: res.username ?? name });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Link Previews</h1>
          <p className="mt-1 text-sm text-slate-500">Save links and see rich previews.</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-medium">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className={`rounded-md py-1.5 ${isLogin ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
              }}
              className={`rounded-md py-1.5 ${!isLogin ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Register
            </button>
          </div>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <h2 className="text-lg font-semibold text-slate-800">
              {isLogin ? "Sign in to your account" : "Create an account"}
            </h2>
            <div>
              <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-700">
                Username
              </label>
              <input
                id="username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                maxLength={64}
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                required
              />
              {!isLogin && <p className="mt-1 text-xs text-slate-500">At least 6 characters.</p>}
            </div>
            {error && <Alert message={error} />}
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy && <Spinner />}
              {isLogin ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function PreviewImage({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
        <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
        </svg>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

function PreviewCard({
  preview,
  onRefresh,
  onDelete,
}: {
  preview: Preview;
  onRefresh: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState<"refresh" | "delete" | null>(null);
  const link = safeHttpUrl(preview.final_url) ?? safeHttpUrl(preview.url);
  const host = hostOf(preview.final_url || preview.url);
  const title = preview.title || host || preview.url;
  const image = safeHttpUrl(preview.image_url);
  const status = preview.status_code;

  async function run(kind: "refresh" | "delete") {
    setBusy(kind);
    try {
      if (kind === "refresh") await onRefresh(preview.id);
      else await onDelete(preview.id);
    } finally {
      setBusy(null);
    }
  }

  const content = (
    <>
      <div className="aspect-[1.91/1] w-full overflow-hidden bg-slate-100">
        <PreviewImage src={image} alt={preview.title ?? ""} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="truncate font-medium uppercase tracking-wide">{host}</span>
          {status != null && (status < 200 || status >= 400) && (
            <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">
              HTTP {status}
            </span>
          )}
        </div>
        <h3 className="line-clamp-2 break-words font-semibold text-slate-900 group-hover:text-indigo-700">
          {title}
        </h3>
        {preview.description && (
          <p className="line-clamp-3 break-words text-sm text-slate-600">{preview.description}</p>
        )}
      </div>
    </>
  );

  return (
    <article className="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:shadow-md">
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer nofollow" className="group flex flex-1 flex-col">
          {content}
        </a>
      ) : (
        <div className="flex flex-1 flex-col">{content}</div>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5">
        <span className="truncate text-xs text-slate-400" title={preview.fetched_at}>
          Fetched {formatDate(preview.fetched_at)}
        </span>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => run("refresh")}
            disabled={busy !== null}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            aria-label={`Refresh preview for ${title}`}
          >
            {busy === "refresh" && <Spinner className="h-3 w-3" />}
            Refresh
          </button>
          <button
            type="button"
            onClick={() => run("delete")}
            disabled={busy !== null}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            aria-label={`Delete preview for ${title}`}
          >
            {busy === "delete" && <Spinner className="h-3 w-3" />}
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Previous
      </button>
      <span className="text-sm text-slate-600">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Next
      </button>
    </nav>
  );
}

function Dashboard({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [items, setItems] = useState<Preview[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listPreviews(page, PAGE_SIZE)
      .then((res) => {
        if (cancelled) return;
        const pages = Math.max(1, Math.ceil(res.total / PAGE_SIZE));
        if (res.items.length === 0 && page > pages) {
          setPage(pages);
          return;
        }
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, reloadKey]);

  async function add(e: FormEvent) {
    e.preventDefault();
    let value = url.trim();
    if (!value) return;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
    setAdding(true);
    setError(null);
    try {
      await api.createPreview(value);
      setUrl("");
      if (page === 1) reload();
      else setPage(1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  async function refresh(id: number) {
    setError(null);
    try {
      const updated = await api.refreshPreview(id);
      setItems((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.status === 404) reload();
    }
  }

  async function remove(id: number) {
    setError(null);
    try {
      await api.deletePreview(id);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) {
        setError(errorMessage(err));
        return;
      }
    }
    reload();
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <h1 className="text-lg font-bold text-slate-900">Link Previews</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              Signed in as <span className="font-semibold text-slate-900">{session.username}</span>
            </span>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="url" className="sr-only">
            Link
          </label>
          <input
            id="url"
            type="url"
            inputMode="url"
            placeholder="Paste a link, e.g. https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={adding}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50"
          />
          <button
            type="submit"
            disabled={adding || !url.trim()}
            className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {adding && <Spinner />}
            {adding ? "Adding…" : "Add"}
          </button>
        </form>

        {error && (
          <div className="mt-4">
            <Alert message={error} onClose={() => setError(null)} />
          </div>
        )}

        <div className="mt-6 flex items-center justify-between text-sm text-slate-500">
          <span>
            {total} {total === 1 ? "link" : "links"}
          </span>
          {loading && (
            <span className="flex items-center gap-2">
              <Spinner /> Loading…
            </span>
          )}
        </div>

        {!loading && items.length === 0 ? (
          <div className="mt-6 rounded-xl border-2 border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <p className="font-medium text-slate-700">No links yet</p>
            <p className="mt-1 text-sm text-slate-500">Paste a link above to save it with a preview.</p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => (
              <PreviewCard key={p.id} preview={p} onRefresh={refresh} onDelete={remove} />
            ))}
          </div>
        )}

        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const s = loadSession();
    setAuthToken(s?.token ?? null);
    return s;
  });

  const signIn = useCallback((s: Session) => {
    setAuthToken(s.token);
    saveSession(s);
    setSession(s);
  }, []);

  const clearSession = useCallback(() => {
    setAuthToken(null);
    saveSession(null);
    setSession(null);
  }, []);

  const signOut = useCallback(() => {
    api.logout().catch(() => undefined).finally(clearSession);
  }, [clearSession]);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  if (!session) return <AuthScreen onSignedIn={signIn} />;
  return <Dashboard key={session.token} session={session} onSignOut={signOut} />;
}
