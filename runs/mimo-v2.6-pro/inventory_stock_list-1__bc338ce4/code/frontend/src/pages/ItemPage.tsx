import { useEffect } from "react";
import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { errorMessage } from "../api";
import { useAuth } from "../auth";
import type { Item } from "../types";
import type { Movement } from "../types";
import type { MovementList } from "../types";
import { cardClass } from "../ui";
import { ErrorAlert } from "../ui";
import { InStockBadge } from "../ui";
import { inputClass } from "../ui";
import { labelClass } from "../ui";
import { LowStockBadge } from "../ui";
import { primaryButtonClass } from "../ui";
import { secondaryButtonClass } from "../ui";

export default function ItemPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();

  const [item, setItem] = useState<Item | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setItem(null);
    setMovements([]);
    setMissing(false);
    setError(null);
    Promise.all([
      api<Item>(`/api/items/${id}`),
      api<MovementList>(`/api/items/${id}/movements`),
    ])
      .then(([loadedItem, loadedMovements]) => {
        if (cancelled) return;
        setItem(loadedItem);
        setMovements(loadedMovements.items);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof Error && "status" in err && (err as { status: number }).status === 404) {
          setMissing(true);
        } else {
          setError(errorMessage(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function recordMovement(movement: Movement) {
    setMovements((prev) => [movement, ...prev]);
    setItem((prev) =>
      prev
        ? {
            ...prev,
            quantity: movement.quantity_after,
            low_stock: movement.quantity_after <= prev.reorder_level,
          }
        : prev,
    );
  }

  async function handleDelete() {
    if (!item) return;
    const confirmed = window.confirm(
      `Delete "${item.name}"? Its stock movement history will be removed as well.`,
    );
    if (!confirmed) return;
    try {
      await api(`/api/items/${item.id}`, { method: "DELETE" });
      navigate("/");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (missing) {
    return (
      <div className={`${cardClass} text-center`}>
        <h1 className="mb-2 text-xl font-semibold">Item not found</h1>
        <p className="mb-4 text-slate-600">This item may have been deleted.</p>
        <Link to="/" className={primaryButtonClass}>
          Back to inventory
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ErrorAlert message={error} />

      {item && (
        <>
          <div className={cardClass}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
                <p className="mt-1 text-sm text-slate-500">
                  <span className="font-mono">{item.sku}</span>
                  {item.location ? <> · {item.location}</> : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {token ? (
                  <>
                    <Link to={`/items/${item.id}/edit`} className={secondaryButtonClass}>
                      Edit
                    </Link>
                    <button type="button" onClick={handleDelete} className={secondaryButtonClass}>
                      Delete
                    </button>
                  </>
                ) : (
                  <Link to="/account" className={secondaryButtonClass}>
                    Sign in to manage this item
                  </Link>
                )}
                <Link to="/" className={secondaryButtonClass}>
                  Back
                </Link>
              </div>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Quantity</dt>
                <dd className="text-2xl font-semibold">{item.quantity}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Reorder level</dt>
                <dd className="text-2xl font-semibold">{item.reorder_level}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</dt>
                <dd className="mt-1">{item.low_stock ? <LowStockBadge /> : <InStockBadge />}</dd>
              </div>
            </dl>
          </div>

          {token ? (
            <div className="grid gap-4 md:grid-cols-2">
              <MovementForm item={item} sign={1} onRecord={recordMovement} />
              <MovementForm item={item} sign={-1} onRecord={recordMovement} />
            </div>
          ) : (
            <div className={`${cardClass} text-sm text-slate-600`}>
              <Link to="/account" className="font-medium text-sky-700 hover:underline">
                Sign in
              </Link>{" "}
              to record stock received or taken out.
            </div>
          )}

          <section>
            <h2 className="mb-3 text-lg font-semibold">Stock movements</h2>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 text-right font-semibold">Change</th>
                    <th className="px-4 py-3 font-semibold">Reason</th>
                    <th className="px-4 py-3 text-right font-semibold">Quantity after</th>
                    <th className="px-4 py-3 font-semibold">By</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <tr key={movement.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        {new Date(movement.created_at).toLocaleString()}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${
                          movement.delta > 0 ? "text-emerald-700" : "text-red-700"
                        }`}
                      >
                        {movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{movement.reason || "—"}</td>
                      <td className="px-4 py-3 text-right">{movement.quantity_after}</td>
                      <td className="px-4 py-3 text-slate-600">{movement.username}</td>
                    </tr>
                  ))}
                  {movements.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        No stock movements yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MovementForm({
  item,
  sign,
  onRecord,
}: {
  item: Item;
  sign: 1 | -1;
  onRecord: (movement: Movement) => void;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isReceive = sign === 1;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const quantity = Number(amount);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError("Enter a whole number greater than zero.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const movement = await api<Movement>(`/api/items/${item.id}/movements`, {
        method: "POST",
        body: { delta: sign * quantity, reason },
      });
      onRecord(movement);
      setAmount("");
      setReason("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cardClass}>
      <h3 className="mb-1 text-base font-semibold">{isReceive ? "Receive stock" : "Take out stock"}</h3>
      <p className="mb-4 text-sm text-slate-500">
        {isReceive ? "Record stock received into the warehouse." : "Record stock taken out of the warehouse."}
      </p>
      <div className="space-y-4">
        <div>
          <label htmlFor={`${item.id}-quantity-${sign}`} className={labelClass}>
            Quantity
          </label>
          <input
            id={`${item.id}-quantity-${sign}`}
            type="number"
            min="1"
            step="1"
            className={inputClass}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={`${item.id}-reason-${sign}`} className={labelClass}>
            Reason
          </label>
          <input
            id={`${item.id}-reason-${sign}`}
            className={inputClass}
            placeholder={isReceive ? "e.g. Supplier delivery" : "e.g. Customer order"}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <ErrorAlert message={error} />
        <button type="submit" className={`${primaryButtonClass} w-full`} disabled={busy}>
          {isReceive ? "Receive" : "Take out"}
        </button>
      </div>
    </form>
  );
}
