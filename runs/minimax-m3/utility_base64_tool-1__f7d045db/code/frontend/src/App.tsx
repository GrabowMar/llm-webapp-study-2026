import { useCallback, useEffect, useState } from "react";
import * as api from "./api";
import AuthPanel from "./components/AuthPanel";
import Converter from "./components/Converter";
import HistoryPanel from "./components/HistoryPanel";

export default function App() {
  const [token, setToken] = useState<string | null>(() => api.storedToken());
  const [username, setUsername] = useState<string | null>(() =>
    api.storedUsername(),
  );
  const [error, setError] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  useEffect(() => {
    if (!token) {
      setUsername(null);
      return;
    }
    let active = true;
    api
      .me(token)
      .then((user) => {
        if (!active) return;
        setUsername(user.username);
        api.storeSession(token, user.username);
      })
      .catch(() => {
        if (!active) return;
        api.clearSession();
        setToken(null);
        setUsername(null);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const signedIn = useCallback((newToken: string, newUsername: string) => {
    setToken(newToken);
    setUsername(newUsername);
    setHistoryVersion((version) => version + 1);
  }, []);

  const signedOut = useCallback(() => {
    setToken(null);
    setUsername(null);
    setHistoryVersion((version) => version + 1);
  }, []);

  const handleError = useCallback((message: string | null) => {
    setError(message);
  }, []);

  const refreshHistory = useCallback(() => {
    setHistoryVersion((version) => version + 1);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Base64 Converter
          </h1>
          <p className="text-sm text-slate-400">
            Encode any UTF-8 text to base64 and decode it back. Sign in to keep
            your conversions in a private history.
          </p>
        </header>

        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
          >
            {error}
          </div>
        ) : null}

        <AuthPanel
          token={token}
          username={username}
          onSignedIn={signedIn}
          onSignedOut={signedOut}
          onError={handleError}
        />

        <Converter
          token={token}
          onError={handleError}
          onSaved={refreshHistory}
        />

        <HistoryPanel
          token={token}
          version={historyVersion}
          onError={handleError}
        />

        <footer className="pt-2 text-center text-xs text-slate-600">
          Base64 Converter — Flask API + React frontend
        </footer>
      </div>
    </div>
  );
}
