import { useCallback, useState } from "react";
import { clearSession, getSavedUsername, getToken, saveSession } from "./api";
import AuthPanel from "./components/AuthPanel";
import Timesheet from "./components/Timesheet";

export default function App() {
  const [session, setSession] = useState(() => {
    const token = getToken();
    return token ? { token, username: getSavedUsername() ?? "" } : null;
  });

  const handleSignedIn = useCallback((token: string, username: string) => {
    saveSession(token, username);
    setSession({ token, username });
  }, []);

  const handleSignOut = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  if (!session) return <AuthPanel onSignedIn={handleSignedIn} />;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <h1 className="text-xl font-semibold tracking-tight">Timesheet</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              Signed in as{" "}
              <span className="font-medium text-slate-900">{session.username}</span>
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Timesheet onSessionExpired={handleSignOut} />
      </main>
    </div>
  );
}
