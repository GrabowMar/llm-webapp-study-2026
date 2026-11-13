import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  api,
  getToken,
  setToken,
  shortUrl,
  type Link,
  type Me,
  type Page,
} from "./api";

const PAGE_SIZE = 8;

function message(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function ShortLink({ link }: { link: Link }) {
  const url = shortUrl(link);
  return (
    <a
      href={link.short_url}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
      title={url}
    >
      {url}
    </a>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const field = document.createElement("textarea");
      field.value = text;
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-md border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function Pager({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
      <span>
        {total === 0 ? "No links" : `Page ${page} of ${pages} · ${total} link${total === 1 ? "" : "s"}`}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="rounded-md border border-slate-300 px-3 py-1 font-medium disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-slate-50"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          className="rounded-md border border-slate-300 px-3 py-1 font-medium disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-slate-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function AuthPanel({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register(username.trim(), password);
      }
      const result = await api.login(username.trim(), password);
      setToken(result.token);
      onSignedIn({ username: result.username, is_admin: result.is_admin });
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-slate-900">
          {mode === "login" ? "Welcome back" : "Create an account"}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Sign in to shorten and manage your links.
        </p>
      </div>
      <div className="mb-6 flex rounded-lg bg-slate-100 p-1">
        {(["login", "register"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setMode(tab);
              setError("");
            }}
            className={`flex-1 rounded-md py-1.5 text-sm font-semibold transition ${
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
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-indigo-600 py-2.5 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}

function ShortenForm({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<Link | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setResult(null);
    setBusy(true);
    try {
      const link = await api.createLink(url.trim());
      setResult(link);
      setUrl("");
      onCreated();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Shorten a link</h2>
      <p className="mt-1 text-sm text-slate-500">Paste a long http or https address.</p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          inputMode="url"
          placeholder="https://example.com/very/long/path"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-6 py-2.5 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Shortening…" : "Shorten"}
        </button>
      </form>
      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Your short link
            </p>
            <a
              href={result.short_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block truncate font-medium text-indigo-700 hover:underline"
              title={shortUrl(result)}
            >
              {shortUrl(result)}
            </a>
          </div>
          <CopyButton text={shortUrl(result)} />
        </div>
      )}
    </section>
  );
}

function LinksTable({
  me,
  refreshKey,
}: {
  me: Me;
  refreshKey: number;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Link> | null>(null);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.links(page, PAGE_SIZE);
      setData(result);
      setError("");
    } catch (err) {
      setError(message(err));
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const remove = async (id: number) => {
    try {
      await api.deleteLink(id);
      setConfirmId(null);
      await load();
    } catch (err) {
      setError(message(err));
      setConfirmId(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 py-4 sm:px-6">
        <h2 className="text-lg font-semibold text-slate-900">Recent links</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          Refresh
        </button>
      </div>
      {error && <p className="px-6 pb-3 text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold sm:px-6">Short link</th>
              <th className="px-4 py-3 font-semibold">Original</th>
              <th className="px-4 py-3 font-semibold">Clicks</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold sm:px-6">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                  No links yet. Shorten your first address above.
                </td>
              </tr>
            )}
            {data?.items.map((link) => (
              <tr key={link.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3 sm:px-6">
                  <ShortLink link={link} />
                </td>
                <td className="max-w-[220px] px-4 py-3">
                  <span
                    className="block truncate text-slate-600"
                    title={link.original_url}
                  >
                    {link.original_url}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-700">
                  {link.click_count}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                  {formatDate(link.created_at)}
                </td>
                <td className="px-4 py-3 sm:px-6">
                  {link.owner === me.username ? (
                    confirmId === link.id ? (
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-slate-600">Delete?</span>
                        <button
                          type="button"
                          onClick={() => void remove(link.id)}
                          className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(link.id)}
                        className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                      >
                        Delete
                      </button>
                    )
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && (
        <Pager
          page={data.page}
          total={data.total}
          pageSize={data.page_size}
          onChange={setPage}
        />
      )}
    </section>
  );
}

function AdminPanel({ refreshKey }: { refreshKey: number }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Link> | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.adminLinks(page, PAGE_SIZE);
      setData(result);
      setError("");
    } catch (err) {
      setError(message(err));
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const toggle = async (id: number) => {
    setBusyId(id);
    try {
      await api.toggleLink(id);
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 py-4 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Moderation</h2>
          <p className="text-sm text-slate-500">All links, including disabled ones.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          Refresh
        </button>
      </div>
      {error && <p className="px-6 pb-3 text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold sm:px-6">Short link</th>
              <th className="px-4 py-3 font-semibold">Original</th>
              <th className="px-4 py-3 font-semibold">Owner</th>
              <th className="px-4 py-3 font-semibold">Clicks</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold sm:px-6">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-slate-500">
                  No links have been created yet.
                </td>
              </tr>
            )}
            {data?.items.map((link) => {
              const active = link.is_active !== false;
              return (
                <tr key={link.id} className={active ? "hover:bg-slate-50/60" : "bg-slate-50"}>
                  <td className="px-4 py-3 sm:px-6">
                    <ShortLink link={link} />
                  </td>
                  <td className="max-w-[200px] px-4 py-3">
                    <span
                      className="block truncate text-slate-600"
                      title={link.original_url}
                    >
                      {link.original_url}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{link.owner}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">
                    {link.click_count}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    {formatDate(link.created_at)}
                  </td>
                  <td className="px-4 py-3 sm:px-6">
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {active ? "Active" : "Disabled"}
                      </span>
                      <button
                        type="button"
                        disabled={busyId === link.id}
                        onClick={() => void toggle(link.id)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                          active
                            ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                            : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        }`}
                      >
                        {busyId === link.id
                          ? "…"
                          : active
                            ? "Disable"
                            : "Re-enable"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data && (
        <Pager
          page={data.page}
          total={data.total}
          pageSize={data.page_size}
          onChange={setPage}
        />
      )}
    </section>
  );
}

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    api
      .me()
      .then((result) => {
        if (mounted.current) setMe(result);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) setToken(null);
      })
      .finally(() => {
        if (mounted.current) setChecking(false);
      });
  }, []);

  const refresh = () => setRefreshKey((key) => key + 1);

  const signOut = async () => {
    try {
      await api.logout();
    } catch {
      // Clearing the local token is enough even if the request fails.
    }
    setToken(null);
    setMe(null);
    setRefreshKey(0);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              /
            </span>
            <span className="text-lg font-bold tracking-tight">short.ly</span>
          </div>
          {me ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-slate-500 sm:inline">
                Signed in as <strong className="text-slate-800">{me.username}</strong>
                {me.is_admin && (
                  <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                    admin
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium transition hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          ) : (
            <span className="text-sm text-slate-500">Shorten · share · track</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {checking ? (
          <p className="py-16 text-center text-slate-500">Loading…</p>
        ) : !me ? (
          <AuthPanel onSignedIn={setMe} />
        ) : (
          <div className="space-y-6">
            <ShortenForm onCreated={refresh} />
            <LinksTable me={me} refreshKey={refreshKey} />
            {me.is_admin && <AdminPanel refreshKey={refreshKey} />}
          </div>
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-8 text-center text-xs text-slate-400 sm:px-6">
        Short links redirect anyone, even without an account.
      </footer>
    </div>
  );
}
