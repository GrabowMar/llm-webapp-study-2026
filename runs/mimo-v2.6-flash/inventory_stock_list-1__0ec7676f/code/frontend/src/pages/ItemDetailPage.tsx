import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link, { navigate } from "../router";
import { api, toApiError, type Item, type Movement } from "../api";

interface Props {
  id: number;
  user: string | null;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function ItemDetailPage({ id, user }: Props) {
  const [item, setItem] = useState<Item | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [receiveQty, setReceiveQty] = useState("");
  const [receiveReason, setReceiveReason] = useState("");
  const [takeQty, setTakeQty] = useState("");
  const [takeReason, setTakeReason] = useState("");
  const [receiveError, setReceiveError] = useState("");
  const [takeError, setTakeError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [nextItem, nextMovements] = await Promise.all([
      api.getItem(id),
      api.listMovements(id),
    ]);
    setItem(nextItem);
    setMovements(nextMovements.items);
    return nextItem;
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh()
      .then(() => {
        if (!cancelled) setError("");
      })
      .catch((err) => {
        if (!cancelled) setError(toApiError(err).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const record = async (sign: 1 | -1) => {
    const amountText = sign === 1 ? receiveQty : takeQty;
    const reason = (sign === 1 ? receiveReason : takeReason).trim();
    const setAmountError = sign === 1 ? setReceiveError : setTakeError;
    setAmountError("");
    const amount = Number(amountText);
    if (!amountText || !Number.isInteger(amount) || amount <= 0) {
      setAmountError("Enter a whole number greater than zero.");
      return;
    }
    setBusy(true);
    try {
      await api.createMovement(id, { delta: sign * amount, reason });
      await refresh();
      if (sign === 1) {
        setReceiveQty("");
        setReceiveReason("");
      } else {
        setTakeQty("");
        setTakeReason("");
      }
    } catch (err) {
      setAmountError(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const submitReceive = (event: FormEvent) => {
    event.preventDefault();
    void record(1);
  };

  const submitTake = (event: FormEvent) => {
    event.preventDefault();
    void record(-1);
  };

  const remove = async () => {
    if (!item) return;
    const confirmed = window.confirm(
      `Delete "${item.name}" (${item.sku})? Its stock movements will be deleted too.`,
    );
    if (!confirmed) return;
    try {
      await api.deleteItem(item.id);
      navigate("/");
    } catch (err) {
      setError(toApiError(err).message);
    }
  };

  if (loading && !item) {
    return <p className="text-slate-500">Loading item…</p>;
  }

  if (!item) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p className="font-semibold">{error || "Item not found"}</p>
        <Link to="/" className="mt-3 inline-block text-sky-700 hover:underline">
          Back to inventory
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link to="/" className="text-sm text-sky-700 hover:underline">
        ← Back to inventory
      </Link>

      {error && (
        <div
          role="alert"
          className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{item.name}</h1>
            <p className="mt-1 font-mono text-sm text-slate-600">{item.sku}</p>
            <p className="text-sm text-slate-600">
              Location: {item.location || "—"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold">
              {item.quantity}
              <span className="ml-1 text-sm font-normal text-slate-500">in stock</span>
            </p>
            <p className="text-sm text-slate-600">Reorder level: {item.reorder_level}</p>
            <span
              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                item.low_stock
                  ? "bg-red-100 text-red-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {item.low_stock ? "Low stock" : "OK"}
            </span>
          </div>
        </div>

        {user && (
          <div className="mt-6 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
            <form onSubmit={submitReceive} className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <h2 className="font-semibold text-emerald-800">Receive stock</h2>
              <label htmlFor="receive-qty" className="mt-2 block text-sm font-medium">
                Quantity
              </label>
              <input
                id="receive-qty"
                type="number"
                min={1}
                step={1}
                value={receiveQty}
                onChange={(event) => setReceiveQty(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <label htmlFor="receive-reason" className="mt-2 block text-sm font-medium">
                Reason
              </label>
              <input
                id="receive-reason"
                type="text"
                placeholder="e.g. delivery"
                value={receiveReason}
                onChange={(event) => setReceiveReason(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              {receiveError && (
                <p className="mt-2 text-sm text-red-600">{receiveError}</p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="mt-3 w-full rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                Receive
              </button>
            </form>

            <form onSubmit={submitTake} className="rounded-lg border border-sky-200 bg-sky-50 p-4">
              <h2 className="font-semibold text-sky-800">Take out stock</h2>
              <label htmlFor="take-qty" className="mt-2 block text-sm font-medium">
                Quantity
              </label>
              <input
                id="take-qty"
                type="number"
                min={1}
                step={1}
                value={takeQty}
                onChange={(event) => setTakeQty(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <label htmlFor="take-reason" className="mt-2 block text-sm font-medium">
                Reason
              </label>
              <input
                id="take-reason"
                type="text"
                placeholder="e.g. order #123"
                value={takeReason}
                onChange={(event) => setTakeReason(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              {takeError && <p className="mt-2 text-sm text-red-600">{takeError}</p>}
              <button
                type="submit"
                disabled={busy}
                className="mt-3 w-full rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60"
              >
                Take out
              </button>
            </form>
          </div>
        )}

        {!user && (
          <p className="mt-4 border-t border-slate-200 pt-4 text-sm text-slate-600">
            <Link to="/login" className="font-medium text-sky-700 hover:underline">
              Sign in
            </Link>{" "}
            to receive or take out stock.
          </p>
        )}

        {user && (
          <div className="mt-4 flex gap-3 border-t border-slate-200 pt-4">
            <Link
              to={`/items/${item.id}/edit`}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Edit item
            </Link>
            <button
              type="button"
              onClick={remove}
              className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
            >
              Delete item
            </button>
          </div>
        )}
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold">Stock movements</h2>
        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Delta</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3 text-right">Quantity after</th>
                <th className="px-4 py-3">User</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                    {formatDate(movement.created_at)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${
                      movement.delta > 0 ? "text-emerald-700" : "text-red-600"
                    }`}
                  >
                    {movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                  </td>
                  <td className="px-4 py-3">{movement.reason || "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {movement.quantity_after}
                  </td>
                  <td className="px-4 py-3">{movement.username}</td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    No movements recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
