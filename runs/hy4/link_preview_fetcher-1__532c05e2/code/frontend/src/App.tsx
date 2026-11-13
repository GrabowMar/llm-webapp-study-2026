import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ApiError,
  apiClient,
  clearToken,
  getToken,
  setToken,
  type Page,
  type Preview,
} from "./api";

const PAGE_SIZE = 6;

interface Session {
  token: string;
  username: string;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Something went wrong. Please try again.";
}

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function Icon({ name, className = "h-4 w-4" }: { name: "refresh" | "trash" | "plus" | "external" | "link"; className?: string }) {
  const paths: Record<string, ReactNode> = {
    refresh: <path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" stroke="currentColor" />,
    trash: <><path d="M4 7h16M10 11v6M14 11v6" strokeLinecap="round" strokeWidth="2" stroke="currentColor" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" stroke="currentColor" /></>,
    plus: <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeWidth="2" stroke="currentColor" />,
    external: <><path d="M14 4h6v6M20 4l-9 9" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" stroke="currentColor" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" stroke="currentColor" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.07 0l2-2a5 5 0 0 0-7.07-7.07l-1.5 1.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" stroke="currentColor" /><path d="M14 11a5 5 0 0 0-7.07 0l-2 2A5 5 0 0 0 12 20.07l1.5-1.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" stroke="currentColor" /></>,
  };
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function hostOf(preview: Preview): string {
  try {
    return new URL(preview.final_url || preview.url).hostname.replace(/^www\./, "");
  } catch {
    return preview.url;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function AuthScreen({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") await apiClient.register(username.trim(), password);
      const token = await apiClient.login(username.trim(), password);
      setToken(token);
      const me = await apiClient.me();
      onSignedIn({ token, username: me.username });
    } catch (err) {
      clearToken();
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.18),transparent_55%)]" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/30">
            <Icon name="link" className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Link Vault</h1>
          <p className="mt-2 text-sm text-slate-400">Save your links with beautiful previews.</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/40 backdrop-blur sm:p-8">
          <div role="tablist" aria-label="Account" className="mb-6 flex rounded-xl bg-slate-950/60 p-1">
            {(["login", "register"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={mode === tab}
                onClick={() => { setMode(tab); setError(""); }}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  mode === tab ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab === "login" ? "Sign in" : "Register"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-slate-300">Username</label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="jane"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-300">Password</label>
              <input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy && <Spinner />}
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
          <p className="mt-5 text-center text-xs text-slate-500">
            {mode === "login" ? "New here? Create an account above." : "Already have an account? Sign in above."}
          </p>
        </div>
      </div>
    </div>
  );
}

function PreviewImage({ preview }: { preview: Preview }) {
  const [failed, setFailed] = useState(false);
  const host = hostOf(preview);
  if (!preview.image_url || failed) {
    return (
      <div className="flex h-44 w-full items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-700/50 text-xl font-semibold uppercase text-slate-300 ring-1 ring-white/10">
          {host.charAt(0)}
        </div>
      </div>
    );
  }
  return (
    <img
      src={preview.image_url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-44 w-full bg-slate-800 object-cover"
    />
  );
}

function PreviewCard({
  preview,
  busy,
  onRefresh,
  onDelete,
}: {
  preview: Preview;
  busy: boolean;
  onRefresh: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const host = hostOf(preview);
  const title = preview.title || preview.url;

  return (
    <article className={`group relative flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-lg shadow-black/20 transition hover:border-slate-700 hover:shadow-xl ${busy ? "opacity-60" : ""}`}>
      <a href={preview.url} target="_blank" rel="noopener noreferrer" className="relative block overflow-hidden">
        <PreviewImage preview={preview} />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-slate-950/80 px-2.5 py-1 text-xs font-medium text-slate-200 ring-1 ring-white/10 backdrop-blur">
          <span className={`h-1.5 w-1.5 rounded-full ${preview.status_code && preview.status_code < 400 ? "bg-emerald-400" : "bg-amber-400"}`} />
          {host}
        </span>
      </a>

      <div className="flex flex-1 flex-col p-5">
        <a
          href={preview.url}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-2 text-base font-semibold leading-snug text-white transition hover:text-indigo-300"
          title={preview.url}
        >
          {title}
          <Icon name="external" className="ml-1.5 inline-block h-3.5 w-3.5 align-baseline text-slate-500" />
        </a>
        <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-slate-400">
          {preview.description || "No description was provided for this page."}
        </p>
        <p className="mt-3 text-xs text-slate-600">Updated {formatDate(preview.fetched_at)}</p>

        <div className="mt-4 flex items-center gap-2 border-t border-slate-800 pt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => onRefresh(preview.id)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-indigo-500/60 hover:bg-indigo-500/10 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="refresh" className="h-3.5 w-3.5" />}
            Refresh
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(preview.id)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-red-500/60 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="trash" className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

function Dashboard({ session, onSignedOut }: { session: Session; onSignedOut: () => void }) {
  const [data, setData] = useState<Page>({ items: [], total: 0, page: 1, page_size: PAGE_SIZE });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [busyIds, setBusyIds] = useState<number[]>([]);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError("");
    try {
      const result = await apiClient.listPreviews(targetPage, PAGE_SIZE);
      setData(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSignedOut();
        return;
      }
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [onSignedOut]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  function withBusy(id: number, action: () => Promise<void>) {
    setBusyIds((ids) => [...ids, id]);
    void action()
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusyIds((ids) => ids.filter((item) => item !== id)));
  }

  async function addLink(event: FormEvent) {
    event.preventDefault();
    const value = url.trim();
    if (!value) return;
    setAdding(true);
    setAddError("");
    try {
      await apiClient.addPreview(value);
      setUrl("");
      if (page === 1) await load(1);
      else setPage(1);
    } catch (err) {
      setAddError(errorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  function refresh(id: number) {
    withBusy(id, async () => {
      await apiClient.refreshPreview(id);
      await load(page);
    });
  }

  function remove(id: number) {
    withBusy(id, async () => {
      await apiClient.deletePreview(id);
      const remaining = data.items.length - 1;
      if (remaining === 0 && page > 1) setPage(page - 1);
      else await load(page);
    });
  }

  async function signOut() {
    try {
      await apiClient.logout();
    } catch {
      /* local sign-out still proceeds */
    }
    onSignedOut();
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const first = data.total === 0 ? 0 : (data.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(data.page * PAGE_SIZE, data.total);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.12),transparent_50%)]" />
      <header className="sticky top-0 z-10 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/30">
              <Icon name="link" className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight tracking-tight text-white">Link Vault</h1>
              <p className="text-xs text-slate-500">Your saved links</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-400 sm:inline">
              Signed in as <span className="font-medium text-slate-200">{session.username}</span>
            </span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg border border-slate-700 px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg shadow-black/20 sm:p-6">
          <h2 className="text-base font-semibold text-white">Save a new link</h2>
          <p className="mt-1 text-sm text-slate-400">Paste a URL and we'll fetch its title, description and image.</p>
          <form onSubmit={addLink} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-500">
                <Icon name="link" className="h-4 w-4" />
              </span>
              <input
                type="url"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setAddError(""); }}
                placeholder="https://example.com/article"
                aria-label="Link URL"
                required
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 py-2.5 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>
            <button
              type="submit"
              disabled={adding}
              className="inline-flex min-w-28 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {adding ? <Spinner /> : <Icon name="plus" className="h-4 w-4" />}
              {adding ? "Adding…" : "Add"}
            </button>
          </form>
          {addError && (
            <p role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{addError}</p>
          )}
        </section>

        <section className="mt-10">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-white">Your previews</h2>
            <span className="text-sm text-slate-500">{data.total} {data.total === 1 ? "link" : "links"}</span>
          </div>

          {error && (
            <div role="alert" className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <span>{error}</span>
              <button type="button" onClick={() => void load(page)} className="shrink-0 font-semibold underline hover:text-red-200">Retry</button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 py-20 text-sm text-slate-400">
              <Spinner className="h-5 w-5 text-indigo-400" /> Loading previews…
            </div>
          ) : data.items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">
                <Icon name="link" className="h-6 w-6" />
              </div>
              <p className="font-medium text-slate-300">No links yet</p>
              <p className="mt-1 text-sm text-slate-500">Add your first link above to see its preview here.</p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((preview) => (
                <PreviewCard
                  key={preview.id}
                  preview={preview}
                  busy={busyIds.includes(preview.id)}
                  onRefresh={refresh}
                  onDelete={remove}
                />
              ))}
            </div>
          )}

          {data.total > 0 && (
            <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-6 sm:flex-row">
              <p className="text-sm text-slate-500">
                Showing {first}–{last} of {data.total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-slate-700 px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="px-2 text-sm text-slate-400">
                  Page <span className="font-medium text-white">{page}</span> of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-slate-700 px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setReady(true);
      return;
    }
    void apiClient
      .me()
      .then((user) => setSession({ token, username: user.username }))
      .catch(() => clearToken())
      .finally(() => setReady(true));
  }, []);

  function signOut() {
    clearToken();
    setSession(null);
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <Spinner className="h-6 w-6 text-indigo-400" />
      </div>
    );
  }

  return session ? (
    <Dashboard session={session} onSignedOut={signOut} />
  ) : (
    <AuthScreen onSignedIn={setSession} />
  );
}
