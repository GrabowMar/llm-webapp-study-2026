import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, ApiError, fullShortUrl, Link, Page } from "./api";

interface Session {
  token: string;
  username: string;
}

const STORAGE_KEY = "shortener-session";

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s?.token === "string" && typeof s?.username === "string") return s;
  } catch {
    /* ignore */
  }
  return null;
}

const inputCls =
  "w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const btnCls =
  "rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50";
const btnGhostCls =
  "rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50";

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);

  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  const signIn = (s: Session) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setSession(s);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold">URL Shortener</h1>
          {session && (
            <div className="flex items-center gap-3 text-sm">
              <span data-testid="username">{session.username}</span>
              <button className={btnGhostCls} onClick={signOut}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-8 px-4 py-6">
        {session ? (
          <Dashboard session={session} onExpired={signOut} />
        ) : (
          <AuthForms onSignedIn={signIn} />
        )}
      </main>
    </div>
  );
}

function AuthForms({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const name = username.trim();
      if (mode === "register") {
        await api("/auth/register", { method: "POST", body: { username: name, password } });
        setNotice("Account created. You can sign in now.");
        setMode("login");
        setPassword("");
      } else {
        const res = await api<{ token: string }>("/auth/login", {
          method: "POST",
          body: { username: name, password },
        });
        onSignedIn({ token: res.token, username: name });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex gap-2">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
              setNotice(null);
            }}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium ${
              mode === m ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            {m === "login" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          Username
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
          Password
          <input
            className={inputCls}
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {notice && <p className="text-sm text-green-700">{notice}</p>}
        <button className={`${btnCls} w-full`} disabled={busy}>
          {mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
    </section>
  );
}

function Dashboard({ session, onExpired }: { session: Session; onExpired: () => void }) {
  const isAdmin = session.username.toLowerCase() === "admin";
  const [tab, setTab] = useState<"links" | "admin">("links");
  const [refresh, setRefresh] = useState(0);
  const bump = () => setRefresh((n) => n + 1);

  return (
    <>
      <ShortenForm session={session} onExpired={onExpired} onCreated={bump} />
      {isAdmin && (
        <div className="flex gap-2">
          {(["links", "admin"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                tab === t ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"
              }`}
            >
              {t === "links" ? "Recent links" : "Moderation"}
            </button>
          ))}
        </div>
      )}
      {tab === "admin" && isAdmin ? (
        <LinkTable key="admin" session={session} onExpired={onExpired} admin refresh={refresh} onChanged={bump} />
      ) : (
        <LinkTable key="links" session={session} onExpired={onExpired} refresh={refresh} onChanged={bump} />
      )}
    </>
  );
}

function ShortenForm({
  session,
  onExpired,
  onCreated,
}: {
  session: Session;
  onExpired: () => void;
  onCreated: () => void;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setCopied(false);
    setBusy(true);
    try {
      const link = await api<Link>("/links", {
        method: "POST",
        body: { original_url: url.trim() },
        token: session.token,
      });
      setResult(fullShortUrl(link));
      setUrl("");
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onExpired();
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = result;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-base font-semibold">Shorten an address</h2>
      <form onSubmit={submit} className="flex gap-2">
        <input
          className={inputCls}
          name="url"
          placeholder="https://example.com/a/very/long/address"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button className={btnCls} disabled={busy}>
          Shorten
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {result && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <a
            href={result}
            target="_blank"
            rel="noreferrer"
            data-testid="short-result"
            className="break-all font-medium text-indigo-700 underline"
          >
            {result}
          </a>
          <button className={btnGhostCls} onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </section>
  );
}

function LinkTable({
  session,
  onExpired,
  admin = false,
  refresh,
  onChanged,
}: {
  session: Session;
  onExpired: () => void;
  admin?: boolean;
  refresh: number;
  onChanged: () => void;
}) {
  const pageSize = 10;
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<Page>(
        `${admin ? "/admin" : ""}/links?page=${page}&page_size=${pageSize}`,
        { token: admin ? session.token : null },
      );
      const lastPage = Math.max(1, Math.ceil(res.total / pageSize));
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setData(res);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onExpired();
      setError(err instanceof ApiError ? err.message : "Could not load links");
    }
  }, [admin, page, session.token, onExpired]);

  useEffect(() => {
    load();
  }, [load, refresh]);

  const remove = async (link: Link) => {
    if (!window.confirm(`Delete ${fullShortUrl(link)}? This cannot be undone.`)) return;
    setBusyId(link.id);
    try {
      await api(`/links/${link.id}`, { method: "DELETE", token: session.token });
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onExpired();
      setError(err instanceof ApiError ? err.message : "Could not delete link");
    } finally {
      setBusyId(null);
    }
  };

  const toggle = async (link: Link) => {
    setBusyId(link.id);
    try {
      await api(`/admin/links/${link.id}/toggle`, { method: "POST", token: session.token });
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onExpired();
      setError(err instanceof ApiError ? err.message : "Could not update link");
    } finally {
      setBusyId(null);
    }
  };

  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-base font-semibold">{admin ? "All links" : "Recent links"}</h2>
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {data && data.items.length === 0 && <p className="text-sm text-slate-500">No links yet.</p>}
      {data && data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">Short address</th>
                <th className="py-2 pr-3">Original</th>
                {admin && <th className="py-2 pr-3">Owner</th>}
                <th className="py-2 pr-3">Clicks</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((link) => (
                <tr key={link.id} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-3">
                    <a
                      className="break-all text-indigo-700 underline"
                      href={link.short_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {fullShortUrl(link)}
                    </a>
                    {admin && link.active === false && (
                      <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                        disabled
                      </span>
                    )}
                  </td>
                  <td className="max-w-[16rem] py-2 pr-3">
                    <span className="block truncate" title={link.original_url}>
                      {link.original_url}
                    </span>
                  </td>
                  {admin && <td className="py-2 pr-3">{link.owner}</td>}
                  <td className="py-2 pr-3">{link.click_count}</td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    {new Date(link.created_at).toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap py-2 text-right">
                    {admin && (
                      <button
                        className={btnGhostCls}
                        disabled={busyId === link.id}
                        onClick={() => toggle(link)}
                      >
                        {link.active === false ? "Enable" : "Disable"}
                      </button>
                    )}
                    {!admin && link.owner === session.username && (
                      <button
                        className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                        disabled={busyId === link.id}
                        onClick={() => remove(link)}
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
      {data && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button className={btnGhostCls} disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            Page {data.page} of {lastPage} ({data.total} links)
          </span>
          <button className={btnGhostCls} disabled={page >= lastPage} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      )}
    </section>
  );
}
