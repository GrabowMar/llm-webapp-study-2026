import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./api";
import AuthPanel from "./components/AuthPanel";
import Checker from "./components/Checker";
import History from "./components/History";

const TOKEN_KEY = "xmlcheck.token";
const USER_KEY = "xmlcheck.username";

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem(USER_KEY));
  const [historyVersion, setHistoryVersion] = useState(0);

  const signOutLocal = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUsername(null);
  }, []);

  useEffect(() => {
    if (!token) return;
    api
      .me(token)
      .then((me) => {
        setUsername(me.username);
        localStorage.setItem(USER_KEY, me.username);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) signOutLocal();
      });
  }, [token, signOutLocal]);

  const handleSignedIn = (newToken: string, name: string) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, name);
    setToken(newToken);
    setUsername(name);
  };

  const handleSignOut = async () => {
    if (token) await api.logout(token).catch(() => undefined);
    signOutLocal();
  };

  const handleAuthError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) signOutLocal();
    },
    [signOutLocal],
  );

  const handleSaved = useCallback(() => setHistoryVersion((v) => v + 1), []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold">XML Well-formedness Checker</h1>
            <p className="text-xs text-slate-500">Syntax only — no schema validation, nothing fetched.</p>
          </div>
          {token && username && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as <span data-testid="current-user" className="font-medium text-slate-900">{username}</span>
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="min-w-0">
          <Checker
            token={token}
            onSaved={handleSaved}
            onAuthError={handleAuthError}
          />
        </section>
        <aside className="min-w-0 space-y-6">
          {token ? (
            <History token={token} version={historyVersion} onAuthError={handleAuthError} />
          ) : (
            <AuthPanel onSignedIn={handleSignedIn} />
          )}
        </aside>
      </main>
    </div>
  );
}
