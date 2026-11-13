import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  clearSession,
  createTransfer,
  fetchAccount,
  fetchCsrfToken,
  loginUser,
  logoutUser,
  registerUser,
  storedToken,
  storeSession,
  type NewTransfer,
} from "./api";
import AuthPanel from "./components/AuthPanel";
import TransactionHistory from "./components/TransactionHistory";
import TransferForm from "./components/TransferForm";
import { formatMoney } from "./format";
import type { Account } from "./types";

type Status = "loading" | "signed-out" | "signed-in";

export default function App() {
  const [status, setStatus] = useState<Status>("loading");
  const [account, setAccount] = useState<Account | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const loadAccount = useCallback(async () => {
    const fresh = await fetchAccount();
    setAccount(fresh);
    return fresh;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!storedToken()) {
        if (!cancelled) {
          setStatus("signed-out");
        }
        return;
      }
      try {
        await fetchAccount();
        if (!cancelled) {
          setStatus("signed-in");
        }
      } catch {
        clearSession();
        if (!cancelled) {
          setStatus("signed-out");
        }
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAuth(
    mode: "login" | "register",
    username: string,
    password: string,
  ) {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const session =
        mode === "login"
          ? await loginUser(username, password)
          : await registerUser(username, password);
      storeSession(session.token, session.csrf_token);
      await fetchCsrfToken().catch(() => undefined);
      await loadAccount();
      setStatus("signed-in");
    } catch (error) {
      setAuthError(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    try {
      await logoutUser();
    } catch {
      // The session is dropped locally even if the server call fails.
    }
    clearSession();
    setAccount(null);
    setAuthError(null);
    setStatus("signed-out");
  }

  async function handleTransfer(
    transfer: NewTransfer,
  ): Promise<{ ok: boolean; message: string }> {
    try {
      const created = await createTransfer(transfer);
      await loadAccount();
      setHistoryKey((key) => key + 1);
      return {
        ok: true,
        message: `Sent ${formatMoney(created.amount)} to ${created.to_username}.`,
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof ApiError
            ? error.message
            : "The transfer could not be completed.",
      };
    }
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-400">Loading your account…</p>
      </div>
    );
  }

  if (status === "signed-out" || !account) {
    return (
      <AuthPanel
        onSubmit={handleAuth}
        busy={authBusy}
        error={authError}
      />
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800/80 bg-slate-900/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/15 ring-1 ring-indigo-400/40">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 text-indigo-300"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 10.5 12 4l9 6.5M5 9.5V20h14V9.5M9.5 20v-5.5h5V20"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Meridian Bank</p>
              <p className="text-xs text-slate-500">Transfers without the fuss</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-slate-800/80 px-3 py-1.5 text-sm font-medium text-slate-200 ring-1 ring-slate-700">
              {account.username}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-xl border border-slate-700 px-3.5 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500/40"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <section className="rounded-2xl border border-slate-800 bg-gradient-to-br from-indigo-500/20 via-slate-900/70 to-slate-900/70 p-6 shadow-xl shadow-black/20 sm:p-8">
          <p className="text-sm font-medium uppercase tracking-widest text-indigo-200/80">
            Available balance
          </p>
          <p
            data-testid="balance"
            className="mt-2 text-4xl font-semibold tracking-tight text-white tabular-nums sm:text-5xl"
          >
            {formatMoney(account.balance)}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Signed in as <span className="text-slate-200">{account.username}</span>
          </p>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <TransferForm balance={account.balance} onSubmit={handleTransfer} />
          <TransactionHistory refreshKey={historyKey} />
        </div>
      </main>
    </div>
  );
}
