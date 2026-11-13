import { FormEvent, useState } from "react";
import { ApiError, Transfer, api, fmt } from "./api";

const input =
  "w-full rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none";

export default function TransferForm({ onDone }: { onDone: () => Promise<void> }) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const review = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const n = Number(amount);
    if (!/^\d+(\.\d{1,2})?$/.test(amount.trim()) || !(n > 0)) {
      setError("Enter a positive amount with at most two decimals.");
      return;
    }
    setConfirming(true);
  };

  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const { csrf_token } = await api<{ csrf_token: string }>("GET", "/auth/csrf");
      const t = await api<Transfer>(
        "POST",
        "/transfers",
        { to_username: to.trim(), amount: amount.trim(), memo },
        { "X-CSRF-Token": csrf_token },
      );
      setSuccess(`Sent ${fmt(t.amount)} to ${t.to_username}.`);
      setTo("");
      setAmount("");
      setMemo("");
      setConfirming(false);
      await onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg bg-white p-6 shadow">
      <h2 className="mb-4 text-lg font-semibold">Send money</h2>
      {error && (
        <p role="alert" className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="mb-3 rounded bg-green-50 p-2 text-sm text-green-700">
          {success}
        </p>
      )}
      {confirming ? (
        <div className="space-y-3" data-testid="confirm">
          <p>
            Send <strong>{fmt(Number(amount))}</strong> to <strong>{to.trim()}</strong>
            {memo && (
              <>
                {" "}
                with memo “<span>{memo}</span>”
              </>
            )}
            ?
          </p>
          <div className="flex gap-2">
            <button
              onClick={send}
              disabled={busy}
              className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded bg-slate-200 px-4 py-2 hover:bg-slate-300"
            >
              Edit
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={review} className="space-y-3">
          <label className="block text-sm">
            Recipient
            <input
              className={input}
              name="to_username"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            Amount
            <input
              className={input}
              name="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            Memo (optional)
            <input
              className={input}
              name="memo"
              maxLength={200}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </label>
          <button className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700">
            Review transfer
          </button>
        </form>
      )}
    </section>
  );
}
