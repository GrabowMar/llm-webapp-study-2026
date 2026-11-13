import { useCallback, useEffect, useState } from "react";
import { api, clearToken, getToken, setUnauthorizedHandler } from "./api";
import AuthForm from "./components/AuthForm";
import Dashboard from "./components/Dashboard";
import type { Session } from "./types";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearToken();
      setSession(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setBooting(false);
      return;
    }
    api<Session>("/api/auth/me")
      .then((value) => setSession(value))
      .catch(() => clearToken())
      .finally(() => setBooting(false));
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setSession(null);
  }, []);

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <AuthForm onSignedIn={setSession} />;
  }

  return <Dashboard session={session} onSignOut={signOut} />;
}
