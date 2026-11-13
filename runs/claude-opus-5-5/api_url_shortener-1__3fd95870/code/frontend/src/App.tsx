import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ApiError,
  api,
  getToken,
  setToken,
  setUnauthorizedHandler,
  type Link,
  type Page,
  type User,
} from "./api";

const PAGE_SIZE = 10;

function formatDate(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function errorMessage(err: unknown) {
  return err instanceof ApiError || err instanceof Error ? err.message : "Something went wrong";
}

function Card({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-2 text-sm text-red-600">
      {message}
    </p>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";
const primaryBtn =
  "rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button type="button" onClick={copy} className={secondaryBtn}>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function AuthForms({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        await api.register(username, password);
      }
      const res = await api.login(username, password);
      setToken(res.token);
      onSignedIn({ username: res.username, is_admin: res.is_admin });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const tab = (value: "login" | "register", label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(value);
        setError(null);
      }}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
        mode === value ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-800"
      }`}
    >
      {label}
    </button>
  );

  return (
    <Card title={mode === "login" ? "Sign in" : "Create an account"}>
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
        {tab("login", "Sign in")}
        {tab("register", "Register")}
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="auth-username" className="mb-1 block text-sm font-medium text-slate-700">
            Username
          </label>
          <input
            id="auth-username"
            name="username"
            className={inputClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div>
          <label htmlFor="auth-password" className="mb-1 block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="auth-password"
            name="password"
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
        </div>
        <button type="submit" className={`${primaryBtn} w-full`} disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}
        </button>
        <ErrorText message={error} />
      </form>
    </Card>
  );
}

function ShortenForm({ onCreated }: { onCreated: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Link | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const link = await api.createLink(url);
      setCreated(link);
      setUrl("");
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Shorten a URL">
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row" noValidate>
        <label htmlFor="shorten-url" className="sr-only">
          Long URL
        </label>
        <input
          id="shorten-url"
          name="original_url"
          className={inputClass}
          placeholder="https://example.com/a/very/long/address"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="submit" className={`${primaryBtn} shrink-0`} disabled={busy || !url.trim()}>
          {busy ? "Shortening…" : "Shorten"}
        </button>
      </form>
      <ErrorText message={error} />
      {created && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-indigo-50 p-3">
          <span className="text-sm text-slate-600">Your short link:</span>
          <a
            href={created.short_url}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all font-mono text-sm font-medium text-indigo-700 hover:underline"
            data-testid="short-url"
          >
            {created.short_url}
          </a>
          <CopyButton text={created.short_url} />
        </div>
      )}
    </Card>
  );
}

function Pager({ data, onPage }: { data: Page<Link> | null; onPage: (page: number) => void }) {
  if (!data) return null;
  const pages = Math.max(1, Math.ceil(data.total / data.page_size));
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
      <span>
        {data.total} link{data.total === 1 ? "" : "s"} · page {data.page} of {pages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className={secondaryBtn}
          disabled={data.page <= 1}
          onClick={() => onPage(data.page - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className={secondaryBtn}
          disabled={data.page >= pages}
          onClick={() => onPage(data.page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function usePagedLinks(fetcher: (page: number, size: number) => Promise<Page<Link>>, deps: unknown[]) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Link> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetcher(page, PAGE_SIZE)
      .then((res) => {
        if (cancelled) return;
        const pages = Math.max(1, Math.ceil(res.total / res.page_size));
        if (res.items.length === 0 && page > pages) {
          setPage(pages);
          return;
        }
        setData(res);
        setError(null);
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
  }, [page, version, ...deps]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, setPage, reload };
}

function TruncatedUrl({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      className="block max-w-xs truncate text-slate-700 hover:underline"
    >
      {url}
    </a>
  );
}

function RecentLinks({
  user,
  refreshKey,
  onChanged,
}: {
  user: User | null;
  refreshKey: number;
  onChanged: () => void;
}) {
  const { data, error, loading, setPage, reload } = usePagedLinks(api.listLinks, [refreshKey]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const remove = async (link: Link) => {
    if (!window.confirm(`Delete the short link ${link.short_url}? This cannot be undone.`)) return;
    setDeleting(link.id);
    setActionError(null);
    try {
      await api.deleteLink(link.id);
      reload();
      onChanged();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Card
      title="Recent links"
      actions={
        <button type="button" className={secondaryBtn} onClick={reload} disabled={loading}>
          Refresh
        </button>
      }
    >
      <ErrorText message={error || actionError} />
      {data && data.items.length === 0 ? (
        <p className="text-sm text-slate-500">No links yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">Short URL</th>
                <th className="py-2 pr-3">Original URL</th>
                <th className="py-2 pr-3 text-right">Clicks</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {data?.items.map((link) => (
                <tr key={link.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3">
                    <a
                      href={link.short_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-indigo-700 hover:underline"
                    >
                      {link.short_url}
                    </a>
                  </td>
                  <td className="py-2 pr-3">
                    <TruncatedUrl url={link.original_url} />
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{link.click_count}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-slate-600">{formatDate(link.created_at)}</td>
                  <td className="py-2 text-right">
                    {user && user.username === link.owner && (
                      <button
                        type="button"
                        onClick={() => remove(link)}
                        disabled={deleting === link.id}
                        className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager data={data} onPage={setPage} />
    </Card>
  );
}

function AdminLinks({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { data, error, loading, setPage, reload } = usePagedLinks(api.adminLinks, [refreshKey]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const toggle = async (link: Link) => {
    setBusy(link.id);
    setActionError(null);
    try {
      await api.toggleLink(link.id);
      reload();
      onChanged();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card
      title="All links (admin)"
      actions={
        <button type="button" className={secondaryBtn} onClick={reload} disabled={loading}>
          Refresh
        </button>
      }
    >
      <ErrorText message={error || actionError} />
      {data && data.items.length === 0 ? (
        <p className="text-sm text-slate-500">No links.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">Short code</th>
                <th className="py-2 pr-3">Original URL</th>
                <th className="py-2 pr-3">Owner</th>
                <th className="py-2 pr-3 text-right">Clicks</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {data?.items.map((link) => (
                <tr key={link.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-mono">{link.short_code}</td>
                  <td className="py-2 pr-3">
                    <TruncatedUrl url={link.original_url} />
                  </td>
                  <td className="py-2 pr-3">{link.owner}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{link.click_count}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-slate-600">{formatDate(link.created_at)}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        link.is_active ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {link.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => toggle(link)}
                      disabled={busy === link.id}
                      className={secondaryBtn}
                    >
                      {link.is_active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager data={data} onPage={setPage} />
    </Card>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(() => !!getToken());
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
    });
    if (getToken()) {
      api
        .me()
        .then(setUser)
        .catch(() => {
          setToken(null);
          setUser(null);
        })
        .finally(() => setChecking(false));
    }
    return () => setUnauthorizedHandler(null);
  }, []);

  const signOut = async () => {
    try {
      await api.logout();
    } catch {
      setToken(null);
    }
    setToken(null);
    setUser(null);
    bump();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold text-indigo-700">URL Shortener</h1>
          {user && (
            <div className="flex items-center gap-3 text-sm">
              <span>
                Signed in as <strong data-testid="current-user">{user.username}</strong>
                {user.is_admin && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    admin
                  </span>
                )}
              </span>
              <button type="button" onClick={signOut} className={secondaryBtn}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {checking ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : user ? (
          <ShortenForm onCreated={bump} />
        ) : (
          <div className="mx-auto max-w-md">
            <AuthForms
              onSignedIn={(u) => {
                setUser(u);
                bump();
              }}
            />
          </div>
        )}
        <RecentLinks user={user} refreshKey={refreshKey} onChanged={bump} />
        {user?.is_admin && <AdminLinks refreshKey={refreshKey} onChanged={bump} />}
      </main>
    </div>
  );
}
