import { useEffect, useState } from "react";
import AuthForm from "./AuthForm";
import Converter from "./Converter";
import History from "./History";
import { ApiError, listConversions } from "./api";

interface Session {
  username: string;
  token: string;
}

const STORAGE_KEY = "b64.session";

export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [validating, setValidating] = useState(Boolean(session));
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (!session) {
      setValidating(false);
      return;
    }
    let active = true;
    listConversions(session.token, 1, 5)
      .then(() => {
        if (active) setSessionExpired(false);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.message.includes("authentication")) {
          localStorage.removeItem(STORAGE_KEY);
          setSession(null);
          setSessionExpired(true);
        }
      })
      .finally(() => {
        if (active) setValidating(false);
      });
    return () => {
      active = false;
    };
  }, [session]);

  function signOut() {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setSessionExpired(false);
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Base64 Converter</h1>
            <p className="text-xs text-slate-500">Encode and decode UTF-8 text as base64</p>
          </div>
          {session ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="font-medium text-slate-700">{session.username}</span>
              <button
                onClick={signOut}
                className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          ) : (
            <span className="text-xs text-slate-500">
              <a href="#account" className="font-medium hover:text-slate-700">
                Sign in to save history
              </a>
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <Converter token={session?.token ?? null} onSave={() => setRefreshKey((k) => k + 1)} />

        {sessionExpired && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Your session expired. Please sign in again.
          </p>
        )}

        {validating && (
          <p className="text-center text-sm text-slate-400">Checking session…</p>
        )}

        {session && !validating && (
          <History token={session.token} refreshKey={refreshKey} />
        )}

        {!session && (
          <div id="account" className="mx-auto max-w-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Account</h2>
            <AuthForm
              onSignedIn={(username, token) => {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ username, token }));
                setSessionExpired(false);
                setSession({ username, token });
              }}
            />
          </div>
        )}
      </main>
    </div>
  );
}
