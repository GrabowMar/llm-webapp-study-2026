import { useState, type FormEvent } from "react";
import { api, formatMoney, type Transfer } from "./api";

type Draft = { to: string; amount: number; memo: string };

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

export default function TransferForm({
  balance,
  onTransferred,
}: {
  balance: number | null;
  onTransferred: () => void;
}) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<Transfer | null>(null);
  const [busy, setBusy] = useState(false);

  const review = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const recipient = to.trim();
    if (!recipient) {
      setError("Please enter a recipient.");
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) {
      setError("Enter an amount like 25 or 25.50.");
      return;
    }
    const value = Number(amount.trim());
    if (!(value > 0)) {
      setError("Amount must be greater than zero.");
      return;
    }
    setDraft({ to: recipient, amount: value, memo: memo.trim() });
  };

  const confirm = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const transfer = await api.createTransfer(draft.to, draft.amount, draft.memo);
      setSuccess(transfer);
      setDraft(null);
      setTo("");
      setAmount("");
      setMemo("");
      onTransferred();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setDraft(null);
    setError(null);
  };

  return (
    <section className="h-fit rounded-xl bg-white p-6 shadow">
      <h2 className="text-lg font-semibold">Send money</h2>

      {draft ? (
        <div className="mt-4 space-y-4" data-testid="confirm-transfer">
          <p className="text-sm text-slate-600">Please review and confirm this transfer.</p>
          <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
            <div className="flex justify-between gap-4 px-4 py-2">
              <dt className="text-slate-500">Recipient</dt>
              <dd className="break-all font-medium">{draft.to}</dd>
            </div>
            <div className="flex justify-between gap-4 px-4 py-2">
              <dt className="text-slate-500">Amount</dt>
              <dd className="font-semibold tabular-nums">{formatMoney(draft.amount)}</dd>
            </div>
            <div className="flex justify-between gap-4 px-4 py-2">
              <dt className="text-slate-500">Memo</dt>
              <dd className="break-all">{draft.memo || <span className="text-slate-400">—</span>}</dd>
            </div>
            {balance !== null && (
              <div className="flex justify-between gap-4 px-4 py-2">
                <dt className="text-slate-500">Current balance</dt>
                <dd className="tabular-nums">{formatMoney(balance)}</dd>
              </div>
            )}
          </dl>
          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="flex-1 rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {error ? "Back" : "Cancel"}
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="flex-1 rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-60"
            >
              {busy ? "Sending…" : "Confirm"}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={review} className="mt-4 space-y-4" noValidate>
          <div>
            <label htmlFor="to_username" className="block text-sm font-medium text-slate-700">
              Recipient username
            </label>
            <input
              id="to_username"
              name="to_username"
              autoComplete="off"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-slate-700">
              Amount
            </label>
            <input
              id="amount"
              name="amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputClass} tabular-nums`}
            />
          </div>
          <div>
            <label htmlFor="memo" className="block text-sm font-medium text-slate-700">
              Memo <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="memo"
              name="memo"
              maxLength={200}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className={inputClass}
            />
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              Sent {formatMoney(success.amount)} to {success.to_username}.
            </p>
          )}
          <button
            type="submit"
            className="w-full rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            Review transfer
          </button>
        </form>
      )}
    </section>
  );
}
