import { useCallback, useEffect, useState } from "react";
import { ApiError, clearToken, getAccount, getToken, logout } from "./api";
import type { Account } from "./api";
import AuthScreen from "./components/AuthScreen";
import Dashboard from "./components/Dashboard";

export default function App() {
  const [account, setAccount] = useState<Account | null>(null);
  const [checking, setChecking] = useState(getToken() !== null);

  const refreshAccount = useCallback(async () => {
    try {
      setAccount(await getAccount());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        setAccount(null);
      }
    }
  }, []);

  useEffect(() => {
    if (getToken() === null) return;
    void refreshAccount().finally(() => setChecking(false));
  }, [refreshAccount]);

  const handleSignOut = useCallback(async () => {
    try {
      await logout();
    } finally {
      setAccount(null);
    }
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (!account) {
    return <AuthScreen onAuthed={() => void refreshAccount()} />;
  }

  return (
    <Dashboard
      account={account}
      onSignOut={handleSignOut}
      onAccountChanged={refreshAccount}
    />
  );
}
