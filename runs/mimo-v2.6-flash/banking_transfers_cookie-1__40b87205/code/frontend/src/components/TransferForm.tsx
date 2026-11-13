import { useState } from "react";
import { createTransfer } from "../api";
import { formatMoney } from "../format";

type Props = {
  onSent: () => void | Promise<void>;
};

type Result = { ok: boolean; message: string } | null;

export default function TransferForm({ onSent }: Props) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setTo("");
    setAmount("");
    setMemo("");
    setStep("edit");
    setFormError(null);
    setResult(null);
  }

  function review(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setResult(null);
    const value = Number(amount);
    if (!to.trim()) {
      setFormError("Enter the recipient's username.");
      return;
    }
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) {
      setFormError("Enter an amount greater than zero.");
      return;
    }
    setStep("confirm");
  }

  async function confirm() {
    setBusy(true);
    setFormError(null);
    try {
      await createTransfer({
        to_username: to.trim(),
        amount: Number(amount),
        memo: memo.trim() || undefined,
      });
      setResult({
        ok: true,
        message: `Sent $${formatMoney(Number(amount))} to ${to.trim()}.`,
      });
      await onSent();
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : "The transfer failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200";

  return (
    <section className="rounded-2xl bg-white p-6 shadow">
      <h2 className="text-base font-semibold text-slate-900">Send money</h2>

      {step === "edit" && (
        <form onSubmit={review} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="to"
                className="block text-sm font-medium text-slate-700"
              >
                Recipient username
              </label>
              <input
                id="to"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="alice"
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="amount"
                className="block text-sm font-medium text-slate-700"
              >
                Amount
              </label>
              <input
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="25.00"
                inputMode="decimal"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="memo"
              className="block text-sm font-medium text-slate-700"
            >
              Memo <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Lunch"
              className={inputClass}
            />
          </div>

          {formError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {formError}
            </p>
          )}

          <button
            type="submit"
            className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-500"
          >
            Review transfer
          </button>
        </form>
      )}

      {step === "confirm" && (
        <div className="mt-4 space-y-4">
          <dl className="divide-y divide-slate-200 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between px-4 py-3">
              <dt className="text-sm text-slate-500">Recipient</dt>
              <dd className="text-sm font-medium text-slate-900">{to.trim()}</dd>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <dt className="text-sm text-slate-500">Amount</dt>
              <dd className="text-sm font-medium text-slate-900">
                ${formatMoney(Number(amount))}
              </dd>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <dt className="text-sm text-slate-500">Memo</dt>
              <dd className="text-sm font-medium text-slate-900">
                {memo.trim() || "—"}
              </dd>
            </div>
          </dl>

          {result && (
            <p
              className={
                result.ok
                  ? "rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
                  : "rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
              }
            >
              {result.message}
            </p>
          )}

          {!result && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={busy}
                className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 disabled:opacity-60"
              >
                {busy ? "Sending…" : "Confirm transfer"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("edit");
                  setFormError(null);
                }}
                disabled={busy}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Back
              </button>
            </div>
          )}

          {result?.ok && (
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Send another transfer
            </button>
          )}

          {result && !result.ok && (
            <button
              type="button"
              onClick={() => {
                setStep("edit");
                setResult(null);
              }}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back to edit
            </button>
          )}
        </div>
      )}
    </section>
  );
}
