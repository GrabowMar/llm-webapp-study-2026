import { useCallback, useEffect, useState } from "react";
import { api, ApiError, formatMoney, getToken, onUnauthorized, setToken, type Account } from "./api";
import AuthForm from "./AuthForm";
import History from "./History";
import TransferForm from "./TransferForm";

export default function App() {
  const [signedIn, setSignedIn] = useState<boolean>(() => getToken() !== null);
  const [account, setAccount] = useState<Account | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  const signOutLocally = useCallback(() => {
    setToken(null);
    setAccount(null);
    setSignedIn(false);
  }, []);

  useEffect(() => {
    onUnauthorized(signOutLocally);
    return () => onUnauthorized(null);
  }, [signOutLocally]);

  const loadAccount = useCallback(async () => {
    try {
      setAccount(await api.account());
      setAccountError(null);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        setAccountError(err instanceof Error ? err.message : "Could not load account.");
      }
    }
  }, []);

  useEffect(() => {
    if (signedIn) void loadAccount();
  }, [signedIn, loadAccount]);

  const handleSignedIn = (token: string) => {
    setToken(token);
    setSignedIn(true);
    setHistoryVersion((v) => v + 1);
  };

  const handleSignOut = async () => {
    try {
      await api.logout();
    } catch {
      /* the local session is cleared regardless */
    }
    signOutLocally();
  };

  const handleTransferred = () => {
    void loadAccount();
    setHistoryVersion((v) => v + 1);
  };

  if (!signedIn) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900">
        <AuthForm onSignedIn={handleSignedIn} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-indigo-700 text-white shadow">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <div className="flex items-center justify-between gap-4">
            <span className="text-lg font-semibold tracking-tight">Bank</span>
            <div className="flex items-center gap-3 text-sm">
              <span>
                Signed in as{" "}
                <strong className="font-semibold" data-testid="username">
                  {account?.username ?? "…"}
                </strong>
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-md bg-white/10 px-3 py-1.5 font-medium hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/60"
              >
                Sign out
              </button>
            </div>
          </div>
          <div className="mt-6">
            <p className="text-sm uppercase tracking-wide text-indigo-200">Available balance</p>
            <p className="mt-1 text-5xl font-bold tabular-nums" data-testid="balance">
              {account ? formatMoney(account.balance) : "—"}
            </p>
            {accountError && <p className="mt-2 text-sm text-red-200">{accountError}</p>}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <TransferForm balance={account?.balance ?? null} onTransferred={handleTransferred} />
        <History version={historyVersion} />
      </main>
    </div>
  );
}
