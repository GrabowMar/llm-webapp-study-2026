import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  api,
  clearSession,
  getSession,
  saveSession,
  type Link,
  type LinkPage,
} from "./api";

const PAGE_SIZE = 10;
const ADMIN_PAGE_SIZE = 10;

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function absoluteShortUrl(link: Link): string {
  return window.location.origin + link.short_url;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const primaryButtonClass =
  "rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";

export default function App() {
  const [session, setSession] = useState<{ username: string } | null>(() =>
    getSession(),
  );

  const [mode, setMode] = useState<"login" | "register">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [urlInput, setUrlInput] = useState("");
  const [shortenError, setShortenError] = useState("");
  const [createdLink, setCreatedLink] = useState<Link | null>(null);
  const [copied, setCopied] = useState(false);
  const [shortenBusy, setShortenBusy] = useState(false);

  const [page, setPage] = useState(1);
  const [links, setLinks] = useState<LinkPage | null>(null);
  const [listError, setListError] = useState("");

  const [adminPage, setAdminPage] = useState(1);
  const [adminState, setAdminState] = useState<{
    data: LinkPage;
    activeIds: Set<number>;
  } | null>(null);
  const [adminError, setAdminError] = useState("");

  const isAdmin = session?.username === "admin";

  const handleError = useCallback(
    (error: unknown): string => {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          clearSession();
          setSession(null);
          return "Your session expired. Please sign in again.";
        }
        return error.message;
      }
      return "Something went wrong.";
    },
    [],
  );

  const loadLinks = useCallback(
    async (target: number): Promise<void> => {
      try {
        const data = await api<LinkPage>(
          `/api/links?page=${target}&page_size=${PAGE_SIZE}`,
        );
        const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
        if (data.items.length === 0 && target > totalPages) {
          setPage(totalPages);
          return;
        }
        setLinks(data);
        setListError("");
      } catch (error) {
        setListError(handleError(error));
      }
    },
    [handleError],
  );

  const fetchActiveIds = useCallback(async (): Promise<Set<number>> => {
    const ids = new Set<number>();
    let target = 1;
    for (;;) {
      const data = await api<LinkPage>(`/api/links?page=${target}&page_size=100`);
      for (const item of data.items) ids.add(item.id);
      if (ids.size >= data.total || data.items.length === 0) break;
      target += 1;
    }
    return ids;
  }, []);

  const loadAdmin = useCallback(
    async (target: number): Promise<void> => {
      try {
        const [data, activeIds] = await Promise.all([
          api<LinkPage>(
            `/api/admin/links?page=${target}&page_size=${ADMIN_PAGE_SIZE}`,
          ),
          fetchActiveIds(),
        ]);
        const totalPages = Math.max(1, Math.ceil(data.total / ADMIN_PAGE_SIZE));
        if (data.items.length === 0 && target > totalPages) {
          setAdminPage(totalPages);
          return;
        }
        setAdminState({ data, activeIds });
        setAdminError("");
      } catch (error) {
        setAdminError(handleError(error));
      }
    },
    [fetchActiveIds, handleError],
  );

  useEffect(() => {
    if (session) void loadLinks(page);
  }, [session, page, loadLinks]);

  useEffect(() => {
    if (session && isAdmin) void loadAdmin(adminPage);
  }, [session, isAdmin, adminPage, loadAdmin]);

  async function submitAuth(event: FormEvent): Promise<void> {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    try {
      const credentials = {
        username: authUsername.trim(),
        password: authPassword,
      };
      if (mode === "register") {
        await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify(credentials),
        });
      }
      const data = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      });
      saveSession(data.token, credentials.username);
      setSession({ username: credentials.username });
      setAuthPassword("");
      setPage(1);
      setAdminPage(1);
      setCreatedLink(null);
      setShortenError("");
    } catch (error) {
      setAuthError(handleError(error));
    } finally {
      setAuthBusy(false);
    }
  }

  function signOut(): void {
    clearSession();
    setSession(null);
    setLinks(null);
    setAdminState(null);
    setCreatedLink(null);
    setUrlInput("");
    setShortenError("");
    setAuthError("");
    setAuthPassword("");
  }

  async function submitShorten(event: FormEvent): Promise<void> {
    event.preventDefault();
    setShortenBusy(true);
    setShortenError("");
    setCopied(false);
    try {
      const link = await api<Link>("/api/links", {
        method: "POST",
        body: JSON.stringify({ original_url: urlInput.trim() }),
      });
      setCreatedLink(link);
      setUrlInput("");
      setPage(1);
      await loadLinks(1);
    } catch (error) {
      setCreatedLink(null);
      setShortenError(handleError(error));
    } finally {
      setShortenBusy(false);
    }
  }

  async function copyCreated(): Promise<void> {
    if (!createdLink) return;
    const ok = await copyText(absoluteShortUrl(createdLink));
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  async function deleteLink(link: Link): Promise<void> {
    const confirmed = window.confirm(
      `Delete the short link ${link.short_url}? This cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      await api(`/api/links/${link.id}`, { method: "DELETE" });
      await loadLinks(page);
      if (isAdmin) await loadAdmin(adminPage);
    } catch (error) {
      setListError(handleError(error));
    }
  }

  async function toggleLink(link: Link): Promise<void> {
    try {
      await api(`/api/admin/links/${link.id}/toggle`, { method: "POST" });
      await loadAdmin(adminPage);
      await loadLinks(page);
    } catch (error) {
      setAdminError(handleError(error));
    }
  }

  const linkTotalPages = links
    ? Math.max(1, Math.ceil(links.total / links.page_size))
    : 1;
  const adminTotalPages = adminState
    ? Math.max(1, Math.ceil(adminState.data.total / adminState.data.page_size))
    : 1;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <span className="text-lg font-bold tracking-tight text-indigo-600">
            Shortly
          </span>
          {session && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as{" "}
                <span className="font-medium text-slate-900">
                  {session.username}
                </span>
              </span>
              <button type="button" onClick={signOut} className={secondaryButtonClass}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {!session ? (
          <div className="mx-auto max-w-sm">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h1 className="mb-4 text-xl font-semibold text-slate-900">
                {mode === "login" ? "Sign in" : "Create an account"}
              </h1>
              <div className="mb-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setAuthError("");
                  }}
                  className={
                    mode === "login"
                      ? "flex-1 rounded-md bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700"
                      : "flex-1 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  }
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setAuthError("");
                  }}
                  className={
                    mode === "register"
                      ? "flex-1 rounded-md bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700"
                      : "flex-1 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  }
                >
                  Register
                </button>
              </div>
              <form onSubmit={submitAuth} className="space-y-4">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Username
                  </span>
                  <input
                    type="text"
                    value={authUsername}
                    onChange={(event) => setAuthUsername(event.target.value)}
                    className={inputClass}
                    autoComplete="username"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Password
                  </span>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    className={inputClass}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                  />
                </label>
                {authError && (
                  <p className="text-sm text-red-600" role="alert">
                    {authError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={authBusy}
                  className={`${primaryButtonClass} w-full`}
                >
                  {mode === "login" ? "Sign in" : "Register"}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">
                Shorten a link
              </h2>
              <form onSubmit={submitShorten} className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(event) => setUrlInput(event.target.value)}
                  placeholder="https://example.com/a/very/long/address"
                  aria-label="Long address"
                  className={`${inputClass} sm:flex-1`}
                />
                <button
                  type="submit"
                  disabled={shortenBusy}
                  className={primaryButtonClass}
                >
                  Shorten
                </button>
              </form>
              {shortenError && (
                <p className="mt-3 text-sm text-red-600" role="alert">
                  {shortenError}
                </p>
              )}
              {createdLink && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2">
                  <code className="min-w-0 flex-1 truncate text-sm font-medium text-indigo-900">
                    {absoluteShortUrl(createdLink)}
                  </code>
                  <button
                    type="button"
                    onClick={copyCreated}
                    className={secondaryButtonClass}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  Recent links
                </h2>
                {links && (
                  <span className="text-sm text-slate-500">
                    {links.total} total
                  </span>
                )}
              </div>
              {listError && (
                <p className="mb-3 text-sm text-red-600" role="alert">
                  {listError}
                </p>
              )}
              {links && links.items.length === 0 && (
                <p className="text-sm text-slate-500">No links yet.</p>
              )}
              {links && links.items.length > 0 && (
                <ul className="divide-y divide-slate-100">
                  {links.items.map((link) => (
                    <li
                      key={link.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
                    >
                      <a
                        href={link.short_url}
                        className="font-mono text-sm font-medium text-indigo-600 hover:underline"
                      >
                        {link.short_url}
                      </a>
                      <span
                        title={link.original_url}
                        className="min-w-0 flex-1 truncate text-sm text-slate-600"
                      >
                        {link.original_url}
                      </span>
                      <span className="whitespace-nowrap text-sm text-slate-500">
                        {link.click_count} clicks
                      </span>
                      <span className="whitespace-nowrap text-sm text-slate-400">
                        {formatDate(link.created_at)}
                      </span>
                      {link.owner === session.username && (
                        <button
                          type="button"
                          onClick={() => void deleteLink(link)}
                          className="text-sm font-medium text-red-600 hover:text-red-500"
                        >
                          Delete
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {links && linkTotalPages > 1 && (
                <div className="mt-4 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => value - 1)}
                    className={secondaryButtonClass}
                  >
                    Previous
                  </button>
                  <span className="text-sm text-slate-600">
                    Page {links.page} of {linkTotalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= linkTotalPages}
                    onClick={() => setPage((value) => value + 1)}
                    className={secondaryButtonClass}
                  >
                    Next
                  </button>
                </div>
              )}
            </section>

            {isAdmin && (
              <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">
                    All links (admin)
                  </h2>
                  {adminState && (
                    <span className="text-sm text-slate-500">
                      {adminState.data.total} total
                    </span>
                  )}
                </div>
                {adminError && (
                  <p className="mb-3 text-sm text-red-600" role="alert">
                    {adminError}
                  </p>
                )}
                {!adminState && !adminError && (
                  <p className="text-sm text-slate-500">Loading…</p>
                )}
                {adminState && adminState.data.items.length === 0 && (
                  <p className="text-sm text-slate-500">No links yet.</p>
                )}
                {adminState && adminState.data.items.length > 0 && (
                  <ul className="divide-y divide-slate-100">
                    {adminState.data.items.map((link) => {
                      const enabled = adminState.activeIds.has(link.id);
                      return (
                        <li
                          key={link.id}
                          className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
                        >
                          <a
                            href={link.short_url}
                            className="font-mono text-sm font-medium text-indigo-600 hover:underline"
                          >
                            {link.short_url}
                          </a>
                          <span
                            title={link.original_url}
                            className="min-w-0 flex-1 truncate text-sm text-slate-600"
                          >
                            {link.original_url}
                          </span>
                          <span className="whitespace-nowrap text-sm font-medium text-slate-700">
                            {link.owner}
                          </span>
                          <span className="whitespace-nowrap text-sm text-slate-500">
                            {link.click_count} clicks
                          </span>
                          <span className="whitespace-nowrap text-sm text-slate-400">
                            {formatDate(link.created_at)}
                          </span>
                          <span
                            className={
                              enabled
                                ? "whitespace-nowrap rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
                                : "whitespace-nowrap rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600"
                            }
                          >
                            {enabled ? "Active" : "Disabled"}
                          </span>
                          <button
                            type="button"
                            onClick={() => void toggleLink(link)}
                            className={
                              enabled
                                ? "rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                                : "rounded-md border border-green-200 bg-white px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50"
                            }
                          >
                            {enabled ? "Disable" : "Re-enable"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {adminState && adminTotalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      disabled={adminPage <= 1}
                      onClick={() => setAdminPage((value) => value - 1)}
                      className={secondaryButtonClass}
                    >
                      Previous
                    </button>
                    <span className="text-sm text-slate-600">
                      Page {adminState.data.page} of {adminTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={adminPage >= adminTotalPages}
                      onClick={() => setAdminPage((value) => value + 1)}
                      className={secondaryButtonClass}
                    >
                      Next
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
