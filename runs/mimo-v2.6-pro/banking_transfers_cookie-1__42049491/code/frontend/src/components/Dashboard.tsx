import { useCallback, useState } from "react";
import { api, money } from "../api";
import type { Account } from "../api";
import History from "./History";
import TransferForm from "./TransferForm";

type Props = {
  account: Account;
  onAccountChange: (account: Account) => void;
  onSignOut: () => void;
};

export default function Dashboard({ account, onAccountChange, onSignOut }: Props) {
  const [historyVersion, setHistoryVersion] = useState(0);

  const handleTransferDone = useCallback(() => {
    setHistoryVersion((version) => version + 1);
    api
      .account()
      .then(onAccountChange)
      .catch(() => undefined);
  }, [onAccountChange]);

  async function signOut() {
    try {
      await api.logout();
    } catch {
    }
    onSignOut();
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-indigo-700">Online Bank</h1>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-slate-700 ring-1 ring-slate-200">
            {account.username}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-white hover:text-slate-700"
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="mb-6 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 px-6 py-8 text-white shadow-lg sm:px-8">
        <p className="text-sm font-medium uppercase tracking-wider text-indigo-100">
          Available balance
        </p>
        <p className="mt-2 text-5xl font-semibold tracking-tight">{money(account.balance)}</p>
        <p className="mt-3 text-sm text-indigo-100">Signed in as {account.username}</p>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Send money</h2>
        <TransferForm onDone={handleTransferDone} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Transaction history</h2>
        <History version={historyVersion} />
      </section>
    </div>
  );
}
