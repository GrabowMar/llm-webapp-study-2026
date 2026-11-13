import { useCallback, useState } from "react";
import AuthPanel from "./components/AuthPanel";
import Checker from "./components/Checker";
import History from "./components/History";
import type { Session } from "./types";

const STORE_KEY = "xml-checker-session";

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.token === "string" && typeof parsed.username === "string") {
      return { token: parsed.token, username: parsed.username };
    }
  } catch {
    // corrupt state is treated as signed out
  }
  return null;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [refreshKey, setRefreshKey] = useState(0);

  const signedIn = useCallback((next: Session) => {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
    setSession(next);
  }, []);

  const signedOut = useCallback(() => {
    localStorage.removeItem(STORE_KEY);
    setSession(null);
  }, []);

  const saved = useCallback(() => setRefreshKey((key) => key + 1), []);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-5">
          <h1 className="text-lg font-semibold text-slate-900">XML Well-formedness Checker</h1>
          <p className="mt-1 text-xs text-slate-500">
            Check whether a document is well-formed. Syntax only, no schema validation, and nothing
            is ever fetched from outside the submitted text.
          </p>
        </div>
      </header>
      <main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
        <AuthPanel session={session} onSignedIn={signedIn} onSignOut={signedOut} />
        <Checker session={session} onSaved={saved} onSessionExpired={signedOut} />
        {session && <History session={session} refreshKey={refreshKey} onSessionExpired={signedOut} />}
      </main>
    </div>
  );
}
