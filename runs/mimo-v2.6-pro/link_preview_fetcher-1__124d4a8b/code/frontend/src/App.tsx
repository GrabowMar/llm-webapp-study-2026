import { useCallback, useState } from "react";
import * as api from "./api";
import AuthPanel from "./components/AuthPanel";
import Dashboard from "./components/Dashboard";
import type { Session } from "./types";

export default function App() {
  const [session, setSession] = useState<Session | null>(() => api.loadSession());

  const handleSignedIn = useCallback((next: Session) => {
    api.saveSession(next);
    setSession(next);
  }, []);

  const handleSignOut = useCallback(() => {
    api.clearSession();
    setSession(null);
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {session ? (
        <Dashboard session={session} onSignOut={handleSignOut} />
      ) : (
        <AuthPanel onSignedIn={handleSignedIn} />
      )}
    </div>
  );
}
