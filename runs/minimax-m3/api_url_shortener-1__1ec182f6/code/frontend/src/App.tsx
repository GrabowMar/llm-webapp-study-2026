import { useCallback, useEffect, useState } from "react";
import AdminPanel from "./components/AdminPanel";
import AuthPanel from "./components/AuthPanel";
import LinksTable from "./components/LinksTable";
import ShortenForm from "./components/ShortenForm";
import { api, getToken, setToken } from "./api";
import type { User } from "./types";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!getToken()) {
        setChecking(false);
        return;
      }
      try {
        const me = await api.me();
        if (!cancelled) {
          setUser(me);
        }
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignedIn = useCallback((nextUser: User, token: string) => {
    setToken(token);
    setUser(nextUser);
    setRefreshKey((value) => value + 1);
  }, []);

  const handleSignOut = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500 text-lg font-bold text-white shadow-lg shadow-indigo-500/30">
              S
            </span>
            <div>
              <h1 className="text-lg font-semibold leading-tight text-white">Shortly</h1>
              <p className="text-xs text-slate-400">A small URL shortener</p>
            </div>
          </div>

          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">
                Signed in as{" "}
                <span className="font-medium text-white">{user.username}</span>
                {user.is_admin ? (
                  <span className="ml-2 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-300">
                    admin
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-indigo-400 hover:text-white"
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        {checking ? null : user ? (
          <>
            <ShortenForm onCreated={refresh} />
            <LinksTable user={user} refreshKey={refreshKey} />
            {user.is_admin ? <AdminPanel refreshKey={refreshKey} onChanged={refresh} /> : null}
          </>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center">
              <h2 className="text-2xl font-semibold text-white">Short links for long addresses</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">
                Sign in to shorten links, copy them anywhere, and keep an eye on how many clicks they
                receive. Administrators can moderate every link on the site.
              </p>
            </section>
            <AuthPanel onSignedIn={handleSignedIn} />
          </>
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-10 text-center text-xs text-slate-600">
        Shortly &middot; Flask + React
      </footer>
    </div>
  );
}
