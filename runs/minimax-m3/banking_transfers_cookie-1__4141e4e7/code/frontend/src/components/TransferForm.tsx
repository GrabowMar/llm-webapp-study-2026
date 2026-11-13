import { useState } from "react";
import type { NewTransfer } from "../api";
import { formatMoney } from "../format";

interface TransferFormProps {
  balance: number;
  onSubmit: (transfer: NewTransfer) => Promise<{ ok: boolean; message: string }>;
}

interface PendingTransfer {
  toUsername: string;
  amount: number;
  memo: string;
}

export default function TransferForm({ balance, onSubmit }: TransferFormProps) {
  const [toUsername, setToUsername] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [pending, setPending] = useState<PendingTransfer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const parsedAmount = Number.parseFloat(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;

  async function handleReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    if (!toUsername.trim()) {
      setFeedback({ kind: "error", text: "Enter the recipient's username." });
      return;
    }
    if (!amountValid) {
      setFeedback({ kind: "error", text: "Enter an amount greater than zero." });
      return;
    }
    setPending({
      toUsername: toUsername.trim(),
      amount: parsedAmount,
      memo: memo.trim(),
    });
  }

  async function handleConfirm() {
    if (!pending) {
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      const result = await onSubmit({
        to_username: pending.toUsername,
        amount: pending.amount,
        memo: pending.memo,
      });
      setFeedback({ kind: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        setToUsername("");
        setAmount("");
        setMemo("");
        setPending(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const newBalance = pending ? balance - pending.amount : balance;

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/20">
      <h2 className="text-lg font-semibold text-white">Send money</h2>
      <p className="mt-1 text-sm text-slate-400">
        Transfer funds to another Meridian Bank user.
      </p>

      <form onSubmit={handleReview} className="mt-5 space-y-4">
        <div>
          <label
            htmlFor="to_username"
            className="mb-1.5 block text-sm font-medium text-slate-300"
          >
            Recipient username
          </label>
          <input
            id="to_username"
            value={toUsername}
            onChange={(event) => setToUsername(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2.5 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
            placeholder="e.g. bob"
            autoComplete="off"
          />
        </div>

        <div>
          <label
            htmlFor="amount"
            className="mb-1.5 block text-sm font-medium text-slate-300"
          >
            Amount
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-500">
              $
            </span>
            <input
              id="amount"
              value={amount}
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 py-2.5 pl-7 pr-3.5 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
              placeholder="0.00"
              step="0.01"
              min="0"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="memo"
            className="mb-1.5 block text-sm font-medium text-slate-300"
          >
            Memo <span className="text-slate-500">(optional)</span>
          </label>
          <input
            id="memo"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            maxLength={280}
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2.5 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
            placeholder="What is this for?"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
        >
          Review transfer
        </button>
      </form>

      {pending ? (
        <div className="mt-5 rounded-xl border border-indigo-400/40 bg-indigo-500/10 p-4">
          <h3 className="text-sm font-semibold text-indigo-100">
            Confirm this transfer
          </h3>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">To</dt>
              <dd className="font-medium text-white">{pending.toUsername}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Amount</dt>
              <dd className="font-medium text-white">
                {formatMoney(pending.amount)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Memo</dt>
              <dd className="max-w-[60%] text-right font-medium text-white">
                {pending.memo || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-slate-700/70 pt-1.5">
              <dt className="text-slate-400">Balance after</dt>
              <dd
                className={`font-semibold ${
                  newBalance < 0 ? "text-rose-300" : "text-emerald-300"
                }`}
              >
                {formatMoney(newBalance)}
              </dd>
            </div>
          </dl>

          {feedback?.kind === "error" ? (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
            >
              {feedback.text}
            </p>
          ) : null}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="flex-1 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Sending…" : "Confirm & send"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPending(null);
                setFeedback(null);
              }}
              disabled={submitting}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {feedback?.kind === "success" ? (
        <p
          role="status"
          className="mt-5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-200"
        >
          {feedback.text}
        </p>
      ) : null}
      {feedback?.kind === "error" && !pending ? (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200"
        >
          {feedback.text}
        </p>
      ) : null}
    </section>
  );
}
