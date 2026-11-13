import { useState } from "react";
import { Account, fmt } from "./api";
import History from "./History";
import TransferForm from "./TransferForm";

export default function Dashboard({
  account,
  refresh,
}: {
  account: Account;
  refresh: () => Promise<void>;
}) {
  const [version, setVersion] = useState(0);
  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-white p-6 text-center shadow">
        <p className="text-sm uppercase tracking-wide text-slate-500">Balance</p>
        <p className="text-4xl font-bold" data-testid="balance">
          {fmt(account.balance)}
        </p>
      </section>
      <TransferForm
        onDone={async () => {
          await refresh();
          setVersion((v) => v + 1);
        }}
      />
      <History version={version} username={account.username} />
    </div>
  );
}
