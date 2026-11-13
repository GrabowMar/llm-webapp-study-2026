import { useState } from "react";
import type { FormEvent } from "react";
import { api, getStoredCsrf, money, storeCsrf } from "../api";

type Props = {
  onDone: () => void;
};

export default function TransferForm({ onDone }: Props) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [stage, setStage] = useState<"edit" | "confirm">("edit");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amountValue = Number(amount);
  const valid = recipient.trim() !== "" && amount.trim() !== "" && Number.isFinite(amountValue) && amountValue > 0;

  function review(event: FormEvent) {
    event.preventDefault();
    setSuccess(null);
    if (!valid) {
      setError("Enter a recipient and a positive amount.");
      return;
    }
    setError(null);
    setStage("confirm");
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      let csrf = getStoredCsrf();
      if (!csrf) {
        try {
          csrf = await api.csrf();
          storeCsrf(csrf);
        } catch {
          csrf = null;
        }
      }
      const transfer = await api.createTransfer({
        to_username: recipient.trim(),
        amount: amount.trim(),
        memo: memo.trim() || undefined,
      });
      setSuccess(`Sent ${money(transfer.amount)} to ${transfer.to_username}.`);
      setStage("edit");
      setRecipient("");
      setAmount("");
      setMemo("");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The transfer could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      {stage === "edit" ? (
        <form onSubmit={review} className="space-y-4">
          <div>
            <label htmlFor="recipient" className="mb-1 block text-sm font-medium text-slate-700">
              Recipient
            </label>
            <input
              id="recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Username of the recipient"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div>
            <label htmlFor="amount" className="mb-1 block text-sm font-medium text-slate-700">
              Amount
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                $
              </span>
              <input
                id="amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-300 py-2 pl-7 pr-3 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>
          <div>
            <label htmlFor="memo" className="mb-1 block text-sm font-medium text-slate-700">
              Memo <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="What is it for?"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            Review transfer
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-slate-800">Confirm your transfer</h3>
          <dl className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">To</dt>
              <dd className="font-medium text-slate-900">{recipient.trim()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Amount</dt>
              <dd className="font-medium text-slate-900">{money(amountValue)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Memo</dt>
              <dd className="font-medium text-slate-900">{memo.trim() || "—"}</dd>
            </div>
          </dl>

          {error && (
            <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setStage("edit");
                setError(null);
              }}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Sending..." : "Confirm and send"}
            </button>
          </div>
        </div>
      )}

      {success && (
        <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">
          {success}
        </div>
      )}
    </div>
  );
}
