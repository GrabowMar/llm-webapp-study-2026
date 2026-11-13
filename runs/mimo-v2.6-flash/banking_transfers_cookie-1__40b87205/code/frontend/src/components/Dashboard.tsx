import { useState } from "react";
import type { Account } from "../api";
import { formatMoney } from "../format";
import TransferForm from "./TransferForm";
import TransferList from "./TransferList";

type Props = {
  account: Account;
  onSignOut: () => void;
  onAccountChanged: () => Promise<void>;
};

export default function Dashboard({ account, onSignOut, onAccountChanged }: Props) {
  const [listVersion, setListVersion] = useState(0);

  async function handleTransferSent() {
    await onAccountChanged();
    setListVersion((v) => v + 1);
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <span className="text-lg font-semibold tracking-tight text-slate-900">
            Online Bank
          </span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">{account.username}</span>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <section className="rounded-2xl bg-gradient-to-br from-sky-600 to-sky-500 px-6 py-7 shadow-lg">
          <p className="text-sm font-medium text-sky-100">Balance</p>
          <p className="mt-1 text-5xl font-semibold tracking-tight text-white">
            ${formatMoney(account.balance)}
          </p>
          <p className="mt-2 text-sm text-sky-100">
            Signed in as {account.username}
          </p>
        </section>

        <TransferForm onSent={handleTransferSent} />
        <TransferList version={listVersion} />
      </main>
    </div>
  );
}
