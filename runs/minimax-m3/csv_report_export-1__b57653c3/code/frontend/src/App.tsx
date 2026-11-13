import { useEffect, useState } from "react";
import { clearSession, loadSession, logout, setUnauthorizedHandler } from "./api";
import AuthView from "./components/AuthView";
import Dashboard from "./components/Dashboard";
import type { Session } from "./types";

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());

  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null));
  }, []);

  function handleSignOut() {
    const pending = logout().catch(() => undefined);
    clearSession();
    setSession(null);
    void pending;
  }

  if (!session) {
    return <AuthView onAuthenticated={setSession} />;
  }

  return <Dashboard username={session.username} onSignOut={handleSignOut} />;
}
