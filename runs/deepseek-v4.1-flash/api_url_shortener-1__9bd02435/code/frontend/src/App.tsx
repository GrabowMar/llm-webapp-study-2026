import { useCallback, useEffect, useState } from "react";
import {
  api,
  getToken,
  setToken,
  type Link,
  type Page,
  type User,
} from "./api";
import AuthPanel from "./components/AuthPanel";
import LinkRow from "./components/LinkRow";
import Pager from "./components/Pager";
import ShortenForm from "./components/ShortenForm";

const PAGE_SIZE = 5;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState<"links" | "admin">("links");

  const [linksPage, setLinksPage] = useState<Page<Link> | null>(null);
  const [linksPageNum, setLinksPageNum] = useState(1);
  const [linksError, setLinksError] = useState("");
  const [linksLoading, setLinksLoading] = useState(false);

  const [adminPage, setAdminPage] = useState<Page<Link> | null>(null);
  const [adminPageNum, setAdminPageNum] = useState(1);
  const [adminError, setAdminError] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setBooting(false);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setBooting(false));
  }, []);

  const loadLinks = useCallback(async (page: number) => {
    setLinksLoading(true);
    setLinksError("");
    try {
      const data = await api.listLinks(page, PAGE_SIZE);
      setLinksPage(data);
      setLinksPageNum(page);
    } catch (err) {
      setLinksError(err instanceof Error ? err.message : "Could not load links");
    } finally {
      setLinksLoading(false);
    }
  }, []);

  const loadAdmin = useCallback(async (page: number) => {
    setAdminLoading(true);
    setAdminError("");
    try {
      const data = await api.adminListLinks(page, PAGE_SIZE);
      setAdminPage(data);
      setAdminPageNum(page);
    } catch (err) {
      setAdminError(
        err instanceof Error ? err.message : "Could not load admin links",
      );
    } finally {
      setAdminLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "links") loadLinks(linksPageNum);
  }, [view, linksPageNum, loadLinks]);

  useEffect(() => {
    if (view === "admin" && user?.is_admin) loadAdmin(adminPageNum);
  }, [view, adminPageNum, user, loadAdmin]);

  function signedIn(token: string, signedInUser: User) {
    setToken(token);
    setUser(signedInUser);
    setLinksPageNum(1);
    setAdminPageNum(1);
    setView("links");
  }

  async function signOut() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    setToken(null);
    setUser(null);
    setView("links");
    setLinksPage(null);
    setAdminPage(null);
  }

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.18),_transparent_60%)]" />
      <div className="relative mx-auto max-w-3xl px-4 py-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Snip<span className="text-indigo-400">Link</span>
            </h1>
          </div>
          {user && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-300">
                Signed in as{" "}
                <span className="font-semibold text-white">
                  {user.username}
                </span>
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-indigo-500 hover:text-white"
              >
                Sign out
              </button>
            </div>
          )}
        </header>

        {!user ? (
          <AuthPanel onSignedIn={signedIn} />
        ) : (
          <div className="space-y-6">
            <ShortenForm onCreated={() => {
              setLinksPageNum(1);
              loadLinks(1);
            }} />

            <div className="flex gap-2 rounded-lg bg-slate-900/70 p-1 text-sm">
              <button
                type="button"
                onClick={() => setView("links")}
                className={`rounded-md px-4 py-1.5 font-medium transition ${
                  view === "links"
                    ? "bg-indigo-500 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Recent links
              </button>
              {user.is_admin && (
                <button
                  type="button"
                  onClick={() => setView("admin")}
                  className={`rounded-md px-4 py-1.5 font-medium transition ${
                    view === "admin"
                      ? "bg-indigo-500 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Admin
                </button>
              )}
            </div>

            {view === "links" ? (
              <section>
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-lg font-semibold text-white">
                    Recent links
                  </h2>
                  <span className="text-xs text-slate-500">
                    {linksPage?.total ?? 0} active
                  </span>
                </div>
                {linksError && (
                  <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                    {linksError}
                  </p>
                )}
                {linksLoading && !linksPage && (
                  <p className="text-sm text-slate-500">Loading links...</p>
                )}
                {linksPage && linksPage.items.length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-sm text-slate-500">
                    No links yet. Shorten your first address above.
                  </p>
                )}
                <ul className="space-y-3">
                  {linksPage?.items.map((link) => (
                    <LinkRow
                      key={link.id}
                      link={link}
                      isOwner={link.owner === user.username}
                      isAdmin={false}
                      onChanged={() => loadLinks(linksPageNum)}
                    />
                  ))}
                </ul>
                {linksPage && (
                  <Pager
                    page={linksPage.page}
                    pageSize={linksPage.page_size}
                    total={linksPage.total}
                    onPage={setLinksPageNum}
                  />
                )}
              </section>
            ) : (
              <section>
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-lg font-semibold text-white">
                    All links
                  </h2>
                  <span className="text-xs text-slate-500">
                    {adminPage?.total ?? 0} total
                  </span>
                </div>
                {adminError && (
                  <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                    {adminError}
                  </p>
                )}
                {adminLoading && !adminPage && (
                  <p className="text-sm text-slate-500">Loading links...</p>
                )}
                {adminPage && adminPage.items.length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-sm text-slate-500">
                    No links have been created yet.
                  </p>
                )}
                <ul className="space-y-3">
                  {adminPage?.items.map((link) => (
                    <LinkRow
                      key={link.id}
                      link={link}
                      isOwner={false}
                      isAdmin
                      onChanged={() => loadAdmin(adminPageNum)}
                    />
                  ))}
                </ul>
                {adminPage && (
                  <Pager
                    page={adminPage.page}
                    pageSize={adminPage.page_size}
                    total={adminPage.total}
                    onPage={setAdminPageNum}
                  />
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
