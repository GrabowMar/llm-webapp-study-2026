import { useCallback, useEffect, useState } from "react";
import { Account, ApiError, api, getToken, setToken } from "./api";
import AuthForm from "./AuthForm";
import Dashboard from "./Dashboard";

export default function App() {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(!!getToken());

  const refresh = useCallback(async () => {
    try {
      setAccount(await api<Account>("GET", "/account"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setToken(null);
        setAccount(null);
      }
    }
  }, []);

  useEffect(() => {
    if (getToken()) refresh().finally(() => setLoading(false));
  }, [refresh]);

  const logout = async () => {
    try {
      await api("POST", "/auth/logout");
    } catch {
      /* ignore */
    }
    setToken(null);
    setAccount(null);
  };

  if (loading) return <p className="p-8 text-center text-slate-500">Loading…</p>;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="text-lg font-semibold">Bank</span>
          {account && (
            <div className="flex items-center gap-3 text-sm">
              <span>
                Signed in as <strong data-testid="username">{account.username}</strong>
              </span>
              <button
                onClick={logout}
                className="rounded bg-slate-700 px-3 py-1 hover:bg-slate-600"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        {account ? (
          <Dashboard account={account} refresh={refresh} />
        ) : (
          <AuthForm onSignedIn={refresh} />
        )}
      </main>
    </div>
  );
}
