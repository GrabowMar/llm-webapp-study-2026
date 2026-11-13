import { useCallback, useEffect, useState } from "react";
import AuthScreen from "./AuthScreen";
import History from "./History";
import TransferForm from "./TransferForm";
import { api } from "./api";

interface Session {
  token: string;
  username: string;
  balance: number;
  csrf: string;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);

  const refreshAccount = useCallback(async (token: string) => {
    const account = await api.account(token);
    return account;
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setRestoring(false);
      return;
    }
    (async () => {
      try {
        const account = await refreshAccount(token);
        const { csrf_token } = await api.csrf(token);
        setSession({ token, username: account.username, balance: account.balance, csrf: csrf_token });
      } catch {
        localStorage.removeItem("token");
      } finally {
        setRestoring(false);
      }
    })();
  }, [refreshAccount]);

  async function handleSignedIn(token: string, username: string) {
    localStorage.setItem("token", token);
    const [account, csrf] = await Promise.all([refreshAccount(token), api.csrf(token)]);
    setPage(1);
    setSession({ token, username, balance: account.balance, csrf: csrf.csrf_token });
  }

  async function handleTransferDone() {
    if (!session) return;
    setPage(1);
    setVersion((v) => v + 1);
    try {
      const account = await refreshAccount(session.token);
      setSession({ ...session, balance: account.balance });
    } catch {
      /* handled by history reload */
    }
  }

  async function signOut() {
    if (session) {
      try {
        await api.logout(session.token);
      } catch {
        /* ignore */
      }
      localStorage.removeItem("token");
    }
    setSession(null);
    setPage(1);
  }

  if (restoring) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <AuthScreen onSignedIn={handleSignedIn} />;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 font-bold text-white">
              B
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Bankify</p>
              <p className="text-xs text-slate-500">Signed in as {session.username}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <section className="rounded-2xl bg-indigo-600 p-6 text-white shadow-md">
          <p className="text-sm font-medium text-indigo-200">Balance for {session.username}</p>
          <p className="mt-1 text-4xl font-bold tabular-nums">{session.balance.toFixed(2)}</p>
        </section>

        <TransferForm token={session.token} csrf={session.csrf} onDone={handleTransferDone} />

        <History token={session.token} page={page} version={version} onPageChange={setPage} />
      </main>
    </div>
  );
}
