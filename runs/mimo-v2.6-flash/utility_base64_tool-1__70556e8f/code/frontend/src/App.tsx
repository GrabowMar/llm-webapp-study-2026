import { useCallback, useState } from "react";
import type { Session } from "./api";
import AuthCard from "./components/AuthCard";
import Converter from "./components/Converter";
import History from "./components/History";

const TOKEN_KEY = "base64.token";
const USERNAME_KEY = "base64.username";

function loadSession(): Session | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const username = localStorage.getItem(USERNAME_KEY);
    if (token && username) {
      return { token, username };
    }
  } catch {
    return null;
  }
  return null;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const handleSignedIn = useCallback((next: Session) => {
    try {
      localStorage.setItem(TOKEN_KEY, next.token);
      localStorage.setItem(USERNAME_KEY, next.username);
    } catch {
      // storage unavailable; keep the session in memory
    }
    setSession(next);
    setHistoryRefresh((value) => value + 1);
  }, []);

  const handleSignOut = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USERNAME_KEY);
    } catch {
      // ignore
    }
    setSession(null);
  }, []);

  const handleSaved = useCallback(() => {
    setHistoryRefresh((value) => value + 1);
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <h1 className="text-xl font-bold text-slate-900">Base64 Converter</h1>
          {session ? (
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-600">
                Signed in as <span className="font-semibold">{session.username}</span>
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100"
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <Converter session={session} onSaved={handleSaved} />
        {session ? (
          <History session={session} refreshKey={historyRefresh} />
        ) : (
          <AuthCard onSignedIn={handleSignedIn} />
        )}
      </main>
    </div>
  );
}
