import { useState } from "react";
import { api, ApiError } from "./api";

interface Props {
  token: string;
  csrf: string;
  onDone: () => void;
}

interface Draft {
  to_username: string;
  amount: string;
  memo: string;
}

export default function TransferForm({ token, csrf, onDone }: Props) {
  const [draft, setDraft] = useState<Draft>({ to_username: "", amount: "", memo: "" });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function update(field: keyof Draft, value: string) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  function validate(): string | null {
    const amount = Number(draft.amount);
    if (!draft.to_username.trim()) return "Recipient is required";
    if (!draft.amount || Number.isNaN(amount) || amount <= 0) return "Enter a positive amount";
    if (Math.round(amount * 100) / 100 !== amount) return "Amount may have at most two decimals";
    return null;
  }

  function confirm(event: React.FormEvent) {
    event.preventDefault();
    setSuccess(null);
    const message = validate();
    setError(message);
    if (!message) setConfirming(true);
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const transfer = await api.createTransfer(token, csrf, {
        to_username: draft.to_username.trim(),
        amount: Number(draft.amount),
        memo: draft.memo.trim() || undefined,
      });
      setSuccess(
        `Sent ${transfer.amount.toFixed(2)} to ${transfer.to_username}.` +
          (transfer.memo ? ` Memo: “${transfer.memo}”` : ""),
      );
      setDraft({ to_username: "", amount: "", memo: "" });
      setConfirming(false);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Transfer failed");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Send money</h2>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}
      {success && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>
      )}

      {confirming ? (
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 p-4 ring-1 ring-amber-200">
            <p className="text-sm font-semibold text-amber-900">Confirm transfer</p>
            <dl className="mt-3 space-y-1.5 text-sm text-amber-900">
              <div className="flex justify-between">
                <dt className="text-amber-700">To</dt>
                <dd className="font-medium">{draft.to_username}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-amber-700">Amount</dt>
                <dd className="font-semibold">
                  {Number(draft.amount).toFixed(2)}
                </dd>
              </div>
              {draft.memo.trim() && (
                <div className="flex justify-between gap-4">
                  <dt className="text-amber-700">Memo</dt>
                  <dd className="text-right font-medium">{draft.memo}</dd>
                </div>
              )}
            </dl>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={send}
              disabled={busy}
              className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Sending…" : "Confirm and send"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={confirm} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Recipient username</span>
            <input
              value={draft.to_username}
              onChange={(e) => update("to_username", e.target.value)}
              placeholder="e.g. alice"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Amount</span>
            <input
              value={draft.amount}
              onChange={(e) => update("amount", e.target.value)}
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Memo (optional)</span>
            <input
              value={draft.memo}
              onChange={(e) => update("memo", e.target.value)}
              maxLength={200}
              placeholder="What is it for?"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            Review transfer
          </button>
        </form>
      )}
    </div>
  );
}
