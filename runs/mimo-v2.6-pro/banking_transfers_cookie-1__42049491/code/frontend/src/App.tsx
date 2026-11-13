import { useCallback, useEffect, useState } from "react";
import {
  api,
  clearSession,
  getStoredCsrf,
  getToken,
  setUnauthorizedHandler,
  storeCsrf,
  storeToken,
} from "./api";
import type { Account } from "./api";
import AuthPanel from "./components/AuthPanel";
import Dashboard from "./components/Dashboard";

export default function App() {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [account, setAccount] = useState<Account | null>(null);
  const [booting, setBooting] = useState<boolean>(() => getToken() !== null);

  const signOut = useCallback(() => {
    clearSession();
    setAccount(null);
    setToken(null);
    setBooting(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(signOut);
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    if (!token) {
      setAccount(null);
      setBooting(false);
      return;
    }
    let cancelled = false;
    setBooting(true);
    (async () => {
      try {
        const storedCsrf = getStoredCsrf();
        const [acc, csrf] = await Promise.all([
          api.account(),
          storedCsrf
            ? Promise.resolve(storedCsrf)
            : api.csrf().catch(() => null),
        ]);
        if (cancelled) return;
        if (csrf) storeCsrf(csrf);
        setAccount(acc);
      } catch {
        if (!cancelled) signOut();
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, signOut]);

  const handleSignedIn = useCallback((newToken: string) => {
    storeToken(newToken);
    setToken(newToken);
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {booting ? (
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-lg font-medium text-slate-500">Loading your account...</p>
        </div>
      ) : token && account ? (
        <Dashboard account={account} onAccountChange={setAccount} onSignOut={signOut} />
      ) : (
        <AuthPanel onSignedIn={handleSignedIn} />
      )}
    </div>
  );
}
